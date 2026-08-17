const SPEED_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5];
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
  if (match) return match;
  const max = SPEED_STEPS[SPEED_STEPS.length - 1];
  return value > max ? max : 1;
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

function hashId() {
  return decodeURIComponent((location.hash || '').replace(/^#/, ''));
}

function playIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><polygon points="8,5 20,12 8,19" fill="currentColor"></polygon></svg>`;
}

function pauseIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="7" y="5" width="4" height="14" fill="currentColor"></rect><rect x="13" y="5" width="4" height="14" fill="currentColor"></rect></svg>`;
}

function setPlayingUi(isPlaying) {
  list.querySelectorAll('[data-episode-id]').forEach((card) => {
    const playing = isPlaying && card.dataset.episodeId === activeId;
    card.classList.toggle('is-playing', playing);
    const button = card.querySelector('.edu-play');
    if (button) {
      button.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      button.innerHTML = playing ? pauseIcon() : playIcon();
    }
  });
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

function renderPlayer() {
  return `
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
  `;
}

function renderTrack(episode) {
  const open = episode.id === selectedId;
  return `
    <article
      class="edu-track${open ? ' is-open' : ''}"
      data-episode-id="${escapeHtml(episode.id)}"
    >
      <img
        class="edu-cover"
        src="${escapeHtml(episode.image)}"
        alt="${escapeHtml(episode.name)}"
        width="800"
        height="800"
        data-action="play"
      >
      <div class="edu-track-main">
        <button type="button" class="edu-track-info" data-action="open" aria-expanded="${open ? 'true' : 'false'}">
          <span class="edu-name">${escapeHtml(episode.name)}</span>
          <span class="edu-born">born: ${escapeHtml(String(episode.born))}</span>
        </button>
        ${renderPlayer()}
        ${open ? `
          <div class="edu-track-details">
            <p class="edu-bio">${escapeHtml(episode.bio)}</p>
            ${renderLinks(episode)}
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

function parkTranscripts() {
  const main = document.querySelector('.edu-page main');
  if (!main) return;
  document.querySelectorAll('.edu-transcript').forEach((section) => {
    main.appendChild(section);
  });
}

function attachTranscripts() {
  document.querySelectorAll('.edu-transcript').forEach((section) => {
    const current = section.dataset.transcriptFor === selectedId;
    section.classList.toggle('is-current', current);
    if (current) {
      const details = list.querySelector(`[data-episode-id="${selectedId}"] .edu-track-details`);
      if (details) details.appendChild(section);
    }
  });
}

function restoreActiveUi() {
  applySpeed(savedSpeed(), { persist: false });
  attachTranscripts();
  if (!activeId) return;
  const card = cardEl(activeId);
  if (!card) return;
  updateTimes(card, audio.currentTime, audio.duration);
  setPlayingUi(!audio.paused);
}

function render() {
  const tracks = sortedEpisodes();
  if (!tracks.length) {
    parkTranscripts();
    list.innerHTML = '<p class="edu-empty">no episodes yet.</p>';
    return;
  }

  parkTranscripts();
  list.innerHTML = tracks.map(renderTrack).join('');
  restoreActiveUi();
}

function syncFromHash() {
  const id = hashId();
  selectedId = getEpisode(id) ? id : null;
  render();
}

function toggleOpen(id) {
  if (!getEpisode(id)) return;
  selectedId = selectedId === id ? null : id;
  const next = selectedId ? `#${encodeURIComponent(selectedId)}` : (location.pathname + location.search);
  history.pushState(null, '', next);
  render();
}

async function loadEpisode(episode, { autoplay = false, startTime = null } = {}) {
  const switching = activeId !== episode.id;
  activeId = episode.id;
  list.querySelectorAll('[data-episode-id]').forEach((card) => {
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

  const opener = event.target.closest('[data-action="open"]');
  if (opener) {
    const card = opener.closest('[data-episode-id]');
    if (card) toggleOpen(card.dataset.episodeId);
    return;
  }

  const cover = event.target.closest('.edu-cover');
  const button = event.target.closest('[data-action]');
  if (!cover && !button) return;

  const card = event.target.closest('[data-episode-id]');
  const episode = getEpisode(card?.dataset.episodeId);
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
  const card = event.target.closest('[data-episode-id]');
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
  const card = event.target.closest('[data-episode-id]');
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
    selectedId = getEpisode(hashId()) ? hashId() : null;
    render();
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);
    document.querySelector('.edu-page .site-title')?.addEventListener('click', (event) => {
      if (!selectedId) return;
      event.preventDefault();
      selectedId = null;
      history.pushState(null, '', location.pathname + location.search);
      render();
    });
  } catch (error) {
    console.error('Error loading edu episodes:', error);
    list.innerHTML = '<p class="edu-empty">couldn’t load episodes. please refresh.</p>';
  }
}

init();
