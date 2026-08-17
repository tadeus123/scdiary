const SPEED_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const SKIP_SECONDS = 15;
const SPEED_KEY = 'edu-speed';
const progressKey = (id) => `edu-progress:${id}`;

const audio = document.getElementById('edu-audio');
const list = document.getElementById('edu-episodes');

let episodes = [];
let selectedId = null;
let activeId = null;
let seeking = false;

function lastName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function sortedEpisodes() {
  return [...episodes].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)) || a.name.localeCompare(b.name));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSpeed(speed) {
  return `${Number(speed.toFixed(2)).toString().replace(/\.0+$/, '')}×`;
}

function clampSpeed(value) {
  const match = SPEED_STEPS.find((step) => Math.abs(step - value) < 0.01);
  return match || 1;
}

function savedSpeed() {
  const stored = parseFloat(localStorage.getItem(SPEED_KEY));
  return Number.isFinite(stored) ? clampSpeed(stored) : 1;
}

function absoluteUrl(path) {
  return new URL(path, window.location.origin).href;
}

function hostLabel(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function episodeLinks(episode) {
  if (Array.isArray(episode.links) && episode.links.length) return episode.links;
  if (episode.url) return [{ url: episode.url }];
  return [];
}

function linkLabel(link) {
  return link.label || hostLabel(link.url);
}

function renderLinks(episode) {
  const links = episodeLinks(episode);
  if (!links.length) return '';
  return `<div class="edu-links">${links.map((link) => `
    <a class="edu-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel(link))}</a>
  `).join('')}</div>`;
}

function getEpisode(id) {
  return episodes.find((episode) => episode.id === id);
}

function cardEl(id) {
  return list.querySelector(`[data-episode-id="${id}"]`);
}

function setPlayingUi(isPlaying) {
  list.querySelectorAll('.edu-card').forEach((card) => {
    const playing = isPlaying && card.dataset.episodeId === activeId;
    card.classList.toggle('is-playing', playing);
    const button = card.querySelector('.edu-play');
    if (button) {
      button.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      button.innerHTML = playing ? pauseIcon() : playIcon();
    }
  });
}

function playIcon() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><polygon points="8,5 20,12 8,19" fill="currentColor"></polygon></svg>`;
}

function pauseIcon() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="7" y="5" width="4" height="14" fill="currentColor"></rect><rect x="13" y="5" width="4" height="14" fill="currentColor"></rect></svg>`;
}

function updateTimes(card, current, duration) {
  const currentEl = card.querySelector('.edu-time-current');
  const durationEl = card.querySelector('.edu-time-duration');
  const seek = card.querySelector('.edu-seek');
  if (currentEl) currentEl.textContent = formatTime(current);
  if (durationEl) durationEl.textContent = formatTime(duration);
  if (seek && !seeking) {
    seek.value = duration ? String((current / duration) * 1000) : '0';
  }
}

function saveProgress() {
  if (!activeId || !Number.isFinite(audio.currentTime)) return;
  localStorage.setItem(progressKey(activeId), String(Math.floor(audio.currentTime)));
}

function restoreProgress(id) {
  const stored = parseFloat(localStorage.getItem(progressKey(id)));
  if (Number.isFinite(stored) && stored > 3) {
    audio.currentTime = stored;
  }
}

function updateMediaSession(episode) {
  if (!('mediaSession' in navigator) || !episode) return;

  const artworkSrc = absoluteUrl(episode.image);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: episode.name,
    artist: 'edu',
    album: 'edu',
    artwork: [
      { src: artworkSrc, sizes: '512x512', type: 'image/jpeg' },
      { src: artworkSrc, sizes: '800x800', type: 'image/jpeg' },
    ],
  });

  const seekBy = (offset) => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + offset));
  };

  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('stop', () => {
    audio.pause();
    audio.currentTime = 0;
  });
  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    seekBy(-(details.seekOffset || SKIP_SECONDS));
  });
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    seekBy(details.seekOffset || SKIP_SECONDS);
  });
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.fastSeek && 'fastSeek' in audio) {
      audio.fastSeek(details.seekTime);
    } else if (Number.isFinite(details.seekTime)) {
      audio.currentTime = details.seekTime;
    }
  });
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: Math.min(audio.currentTime, audio.duration),
    });
  } catch {
    // Some browsers reject position updates while metadata is settling.
  }
}

function applySpeed(speed, { persist = true } = {}) {
  const next = clampSpeed(speed);
  audio.playbackRate = next;
  if (persist) localStorage.setItem(SPEED_KEY, String(next));
  list.querySelectorAll('.edu-speed').forEach((el) => {
    el.textContent = formatSpeed(next);
  });
  list.querySelectorAll('.edu-speed-option').forEach((el) => {
    el.classList.toggle('is-active', Math.abs(parseFloat(el.dataset.speed) - next) < 0.01);
  });
  updatePositionState();
}

function closeSpeedMenus(exceptWrap = null) {
  list.querySelectorAll('.edu-speed-wrap').forEach((wrap) => {
    if (wrap === exceptWrap) return;
    wrap.classList.remove('is-open');
    wrap.querySelector('.edu-speed')?.setAttribute('aria-expanded', 'false');
  });
}

function idFromHash() {
  const id = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  return getEpisode(id) ? id : (sortedEpisodes()[0]?.id || null);
}

function renderPeople(people) {
  if (people.length < 2) return '';
  return `<nav class="edu-people" aria-label="People">
    ${people.map((episode) => `
      <a
        class="edu-person${episode.id === selectedId ? ' is-selected' : ''}"
        href="#${encodeURIComponent(episode.id)}"
        data-episode-id="${escapeHtml(episode.id)}"
      >
        <img src="${escapeHtml(episode.image)}" alt="" width="96" height="96">
        <span class="edu-person-name">${escapeHtml(lastName(episode.name))}</span>
      </a>
    `).join('')}
  </nav>`;
}

function renderCard(episode) {
  return `
    <article class="edu-card" data-episode-id="${escapeHtml(episode.id)}">
      <img
        class="edu-cover"
        src="${escapeHtml(episode.image)}"
        alt="${escapeHtml(episode.name)}"
        width="800"
        height="800"
      >
      <div class="edu-copy">
        <h2 class="edu-name">${escapeHtml(episode.name)}</h2>
        <p class="edu-born">born: ${escapeHtml(String(episode.born))}</p>
        <p class="edu-bio">${escapeHtml(episode.bio)}</p>
        ${renderLinks(episode)}
      </div>
      <div class="edu-player">
        <button type="button" class="edu-play" data-action="play" aria-label="Play">${playIcon()}</button>
        <span class="edu-time-current">0:00</span>
        <input
          class="edu-seek"
          type="range"
          min="0"
          max="1000"
          value="0"
          step="1"
          aria-label="Seek"
        >
        <span class="edu-time-duration">0:00</span>
        <div class="edu-speed-wrap">
          <button type="button" class="edu-speed" data-action="speed-toggle" aria-expanded="false" aria-label="Playback speed">1×</button>
          <div class="edu-speed-menu" role="listbox" aria-label="Playback speed">
            ${SPEED_STEPS.map((step) => `
              <button
                type="button"
                class="edu-speed-option"
                data-action="speed-set"
                data-speed="${step}"
                role="option"
              >${formatSpeed(step)}</button>
            `).join('')}
          </div>
        </div>
      </div>
    </article>
  `;
}

function render() {
  const people = sortedEpisodes();
  const episode = getEpisode(selectedId) || people[0];
  if (!episode) {
    list.innerHTML = '<p class="edu-empty">no episodes yet.</p>';
    return;
  }

  selectedId = episode.id;
  if ((location.hash || '').replace(/^#/, '') !== selectedId) {
    history.replaceState(null, '', `#${encodeURIComponent(selectedId)}`);
  }
  list.innerHTML = `${renderPeople(people)}${renderCard(episode)}`;
  applySpeed(savedSpeed(), { persist: false });
  attachTranscripts();
}

function attachTranscripts() {
  document.querySelectorAll('.edu-transcript').forEach((section) => {
    section.classList.toggle('is-current', section.dataset.transcriptFor === selectedId);
  });
}

function showPerson(id) {
  if (!getEpisode(id) || id === selectedId) return;
  if (activeId && activeId !== id && !audio.paused) audio.pause();
  selectedId = id;
  render();
}

async function loadEpisode(episode, { autoplay = false, startTime = null } = {}) {
  const switching = activeId !== episode.id;
  activeId = episode.id;
  list.querySelectorAll('.edu-card').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.episodeId === episode.id);
  });

  if (switching || !audio.src) {
    audio.src = episode.audio;
    audio.load();
    audio.setAttribute('title', episode.name);
    applySpeed(savedSpeed(), { persist: false });
    updateMediaSession(episode);
    const onReady = () => {
      if (startTime == null) restoreProgress(episode.id);
      else audio.currentTime = startTime;
      const card = cardEl(episode.id);
      if (card) updateTimes(card, audio.currentTime, audio.duration);
      updatePositionState();
    };
    if (audio.readyState >= 1) onReady();
    else audio.addEventListener('loadedmetadata', onReady, { once: true });
  }

  if (autoplay) {
    try {
      await audio.play();
    } catch (error) {
      console.error('Could not start playback:', error);
    }
  }
}

list.addEventListener('click', (event) => {
  const speedSet = event.target.closest('[data-action="speed-set"]');
  if (speedSet) {
    applySpeed(parseFloat(speedSet.dataset.speed));
    closeSpeedMenus();
    return;
  }

  const speedToggle = event.target.closest('[data-action="speed-toggle"]');
  if (speedToggle) {
    const wrap = speedToggle.closest('.edu-speed-wrap');
    const willOpen = !wrap.classList.contains('is-open');
    closeSpeedMenus();
    if (willOpen) {
      wrap.classList.add('is-open');
      speedToggle.setAttribute('aria-expanded', 'true');
    }
    return;
  }

  closeSpeedMenus();

  const cover = event.target.closest('.edu-cover');
  const button = event.target.closest('[data-action]');
  if (!cover && !button) return;

  const card = event.target.closest('.edu-card');
  const episode = getEpisode(card.dataset.episodeId);
  if (!episode) return;

  if (cover || button.dataset.action === 'play') {
    if (activeId === episode.id && !audio.paused) {
      audio.pause();
      return;
    }
    loadEpisode(episode, { autoplay: true });
  }
});

document.addEventListener('click', (event) => {
  if (event.target.closest('.edu-speed-wrap')) return;
  closeSpeedMenus();
});

list.addEventListener('input', (event) => {
  const card = event.target.closest('.edu-card');
  if (!card) return;
  const episode = getEpisode(card.dataset.episodeId);
  if (!episode) return;

  if (event.target.classList.contains('edu-seek')) {
    seeking = true;
    const duration = audio.duration || 0;
    const next = (parseFloat(event.target.value) / 1000) * duration;
    card.querySelector('.edu-time-current').textContent = formatTime(next);
  }
});

list.addEventListener('change', (event) => {
  if (!event.target.classList.contains('edu-seek')) return;
  const card = event.target.closest('.edu-card');
  const episode = getEpisode(card.dataset.episodeId);
  if (!episode) return;

  const ratio = parseFloat(event.target.value) / 1000;
  const applySeek = () => {
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = ratio * audio.duration;
    }
    seeking = false;
    saveProgress();
  };

  if (activeId !== episode.id || !audio.src) {
    loadEpisode(episode, { startTime: 0 }).then(() => {
      if (audio.readyState >= 1) applySeek();
      else audio.addEventListener('loadedmetadata', applySeek, { once: true });
    });
    return;
  }

  applySeek();
});

audio.addEventListener('play', () => {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  setPlayingUi(true);
});

audio.addEventListener('pause', () => {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  setPlayingUi(false);
  saveProgress();
});

audio.addEventListener('timeupdate', () => {
  const card = cardEl(activeId);
  if (card) updateTimes(card, audio.currentTime, audio.duration);
  updatePositionState();
});

audio.addEventListener('loadedmetadata', () => {
  const card = cardEl(activeId);
  if (card) updateTimes(card, audio.currentTime, audio.duration);
  updatePositionState();
});

audio.addEventListener('ended', () => {
  if (activeId) localStorage.removeItem(progressKey(activeId));
  setPlayingUi(false);
});

setInterval(saveProgress, 5000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveProgress();
});

function init() {
  try {
    const data = Array.isArray(window.EDU_EPISODES) ? window.EDU_EPISODES : [];
    episodes = data;
    selectedId = idFromHash();
    render();
    window.addEventListener('hashchange', () => {
      const id = idFromHash();
      if (id) showPerson(id);
    });
  } catch (error) {
    console.error('Error loading edu episodes:', error);
    list.innerHTML = '<p class="edu-empty">couldn’t load episodes. please refresh.</p>';
  }
}

init();
