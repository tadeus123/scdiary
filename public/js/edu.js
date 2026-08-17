const SPEED_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5];
const SKIP_SECONDS = 15;
const SPEED_KEY = 'edu-speed';
const ACTIVE_KEY = 'edu-active';
const progressKey = (id) => `edu-progress:${id}`;

const page = document.querySelector('.edu-page');
const audio = document.getElementById('edu-audio');
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('edu-player') : null;

let episodes = [];
let activeId = null;
let seeking = false;
let applyingRemote = false;
let lastWrite = 0;
let clockTimer = null;
let pendingRestore = null;
let holdTimer = null;
const tabId = Math.random().toString(36).slice(2);
const holdAudio = new Audio('/media/edu/silence.mp3');
holdAudio.loop = true;
holdAudio.preload = 'auto';
holdAudio.volume = 0;
holdAudio.playsInline = true;
holdAudio.setAttribute('playsinline', '');
holdAudio.setAttribute('webkit-playsinline', '');

let lastLockLabel = '';

function episodeDuration(id = activeId) {
  const episode = getEpisode(id);
  const stored = Number(episode?.duration);
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

function mediaDuration() {
  const duration = audio.duration;
  if (Number.isFinite(duration) && duration > 0) return duration;
  if (audio.seekable && audio.seekable.length) {
    const end = audio.seekable.end(audio.seekable.length - 1);
    if (Number.isFinite(end) && end > 0) return end;
  }
  return readProgress(activeId).duration || episodeDuration() || 0;
}

function mediaTime() {
  return Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
}

function syncClock() {
  if (!activeId) return;
  const card = cardEl(activeId);
  const duration = mediaDuration();
  const current = mediaTime();
  if (card) updateTimes(card, current, duration);
  updatePositionState();
  updateLockTimes();
  if (!audio.paused) saveProgress({ force: false });
}

function startClock() {
  if (clockTimer) return;
  syncClock();
  clockTimer = setInterval(syncClock, 250);
}

function stopClock() {
  if (!clockTimer) return;
  clearInterval(clockTimer);
  clockTimer = null;
  syncClock();
}

function holdPausedSession() {
  if (!activeId || !audio.paused || audio.ended) return;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  updateLockTimes();
  updatePositionState();
}

function startHold() {
  if (!activeId || audio.ended) {
    stopHold();
    return;
  }
  holdPausedSession();
  holdAudio.play().then(holdPausedSession).catch(() => {});
  if (!holdTimer) holdTimer = setInterval(holdPausedSession, 1500);
}

function stopHold() {
  holdAudio.pause();
  if (holdTimer) {
    clearInterval(holdTimer);
    holdTimer = null;
  }
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

function getEpisode(id) {
  return episodes.find((episode) => episode.id === id);
}

function cardEl(id) {
  return page.querySelector(`[data-episode-id="${id}"]`);
}

function playIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><polygon points="8,5 20,12 8,19" fill="currentColor"></polygon></svg>`;
}

function pauseIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="7" y="5" width="4" height="14" fill="currentColor"></rect><rect x="13" y="5" width="4" height="14" fill="currentColor"></rect></svg>`;
}

function readProgress(id) {
  try {
    const raw = localStorage.getItem(progressKey(id));
    if (!raw) return { time: 0, duration: 0 };
    if (/^\d+(\.\d+)?$/.test(raw)) {
      return { time: parseFloat(raw), duration: 0 };
    }
    const parsed = JSON.parse(raw);
    return {
      time: Number(parsed.time) || 0,
      duration: Number(parsed.duration) || 0,
    };
  } catch {
    return { time: 0, duration: 0 };
  }
}

function finished(time, duration) {
  return duration > 10 && time >= duration - 2;
}

function writeProgress(id, time, duration) {
  if (!id || applyingRemote) return;
  const safeTime = Math.max(0, Math.floor(Number(time) || 0));
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : readProgress(id).duration;
  if (finished(safeTime, safeDuration)) {
    localStorage.removeItem(progressKey(id));
  } else {
    localStorage.setItem(progressKey(id), JSON.stringify({
      time: safeTime,
      duration: safeDuration,
      updated: Date.now(),
    }));
  }
  localStorage.setItem(ACTIVE_KEY, id);
}

function saveProgress({ force = true } = {}) {
  if (!activeId || !Number.isFinite(audio.currentTime) || applyingRemote) return;
  const now = Date.now();
  if (!force && now - lastWrite < 400) return;
  lastWrite = now;
  writeProgress(activeId, mediaTime(), mediaDuration());
  publish({
    type: 'progress',
    id: activeId,
    time: mediaTime(),
    duration: mediaDuration(),
    playing: !audio.paused,
  });
}

function applyProgressUi(id, time, duration) {
  const card = cardEl(id);
  if (card) updateTimes(card, time, duration);
}

function paintSavedProgress() {
  episodes.forEach((episode) => {
    const stored = readProgress(episode.id);
    if (stored.time || stored.duration) {
      applyProgressUi(episode.id, stored.time, stored.duration);
    }
  });
}

function publish(message) {
  if (!channel || applyingRemote) return;
  channel.postMessage({ ...message, tabId });
}

function applyRemote(message) {
  if (!message || message.tabId === tabId || !message.id) return;
  applyingRemote = true;
  try {
    if (message.type === 'play' && message.id !== undefined) {
      if (activeId && activeId !== message.id && !audio.paused) {
        audio.pause();
      } else if (activeId === message.id && !audio.paused) {
        audio.pause();
      }
    }
    if (Number.isFinite(message.time)) {
      applyProgressUi(message.id, message.time, message.duration);
      if (activeId === message.id && audio.paused && Number.isFinite(audio.duration) && Math.abs(audio.currentTime - message.time) > 1) {
        audio.currentTime = message.time;
      }
    }
    if (message.type === 'ended') {
      applyProgressUi(message.id, 0, message.duration || readProgress(message.id).duration);
    }
    if (message.speed != null) {
      applySpeed(message.speed, { persist: false });
    }
  } finally {
    applyingRemote = false;
  }
}

function setPlayingUi(isPlaying) {
  page.querySelectorAll('[data-episode-id]').forEach((card) => {
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
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (currentEl) currentEl.textContent = formatTime(current);
  if (durationEl && safeDuration) durationEl.textContent = formatTime(safeDuration);
  if (seek && !seeking) {
    seek.value = safeDuration ? String(Math.min(1000, (current / safeDuration) * 1000)) : '0';
  }
}

function sessionArtwork(episode) {
  const artworkSrc = absoluteUrl(episode.image);
  return [
    { src: artworkSrc, sizes: '512x512', type: 'image/jpeg' },
    { src: artworkSrc, sizes: '800x800', type: 'image/jpeg' },
  ];
}

function updateLockTimes() {
  if (!('mediaSession' in navigator) || !activeId) return;
  const episode = getEpisode(activeId);
  if (!episode) return;
  const duration = mediaDuration();
  const label = duration ? `${formatTime(mediaTime())} / ${formatTime(duration)}` : 'edu';
  if (label === lastLockLabel && navigator.mediaSession.metadata) return;
  lastLockLabel = label;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: episode.name,
    artist: label,
    album: 'edu',
    artwork: sessionArtwork(episode),
  });
}

function updateMediaSession(episode) {
  if (!('mediaSession' in navigator) || !episode) return;
  lastLockLabel = '';
  updateLockTimes();

  const seekBy = (offset) => {
    const duration = mediaDuration();
    if (!duration) return;
    audio.currentTime = Math.min(duration, Math.max(0, mediaTime() + offset));
    saveProgress();
    syncClock();
  };

  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('stop', () => {
    audio.pause();
    audio.currentTime = 0;
    saveProgress();
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
    saveProgress();
    syncClock();
  });
  updatePositionState();
}

function updatePositionState() {
  if (!('mediaSession' in navigator)) return;
  const duration = mediaDuration();
  if (!duration) return;
  const position = Math.min(Math.max(0, mediaTime()), duration);
  const playbackRate = audio.paused ? 1 : (Number(audio.playbackRate) || 1);
  try {
    navigator.mediaSession.setPositionState({ duration, playbackRate, position });
  } catch {
    try {
      navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position });
    } catch {
      // Some browsers reject position updates while metadata is settling.
    }
  }
}

function applySpeed(speed, { persist = true } = {}) {
  const next = clampSpeed(speed);
  audio.playbackRate = next;
  if (persist) localStorage.setItem(SPEED_KEY, String(next));
  page.querySelectorAll('.edu-speed').forEach((el) => {
    el.textContent = formatSpeed(next);
  });
  page.querySelectorAll('.edu-speed-option').forEach((el) => {
    el.classList.toggle('is-active', Math.abs(parseFloat(el.dataset.speed) - next) < 0.01);
  });
  updatePositionState();
}

function closeSpeedMenus(exceptWrap = null) {
  page.querySelectorAll('.edu-speed-wrap').forEach((wrap) => {
    if (wrap === exceptWrap) return;
    wrap.classList.remove('is-open');
    wrap.querySelector('.edu-speed')?.setAttribute('aria-expanded', 'false');
  });
}

async function loadEpisode(episode, { autoplay = false, startTime = null } = {}) {
  const switching = activeId !== episode.id;
  activeId = episode.id;
  page.querySelectorAll('[data-episode-id]').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.episodeId === episode.id);
  });

  if (switching || !audio.src) {
    audio.playsInline = true;
    audio.src = episode.audio;
    audio.setAttribute('title', episode.name);
    updateMediaSession(episode);
    const stored = readProgress(episode.id);
    pendingRestore = startTime != null ? startTime : stored.time;
    const card = cardEl(episode.id);
    if (card) updateTimes(card, pendingRestore || 0, stored.duration);
  }

  if (autoplay) {
    try {
      await audio.play();
    } catch (error) {
      console.error('Could not start playback:', error);
    }
  }
}

function redirectLegacyHash() {
  if (page.classList.contains('edu-now')) return false;
  const id = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  if (id && getEpisode(id)) {
    location.replace(`/edu/${encodeURIComponent(id)}`);
    return true;
  }
  return false;
}

if (page && audio) {
  holdAudio.className = 'edu-audio';
  document.body.appendChild(holdAudio);

  page.addEventListener('click', (event) => {
    if (event.target.closest('a.edu-track-open')) {
      saveProgress();
    }

    const speedSet = event.target.closest('[data-action="speed-set"]');
    if (speedSet) {
      applySpeed(parseFloat(speedSet.dataset.speed));
      closeSpeedMenus();
      publish({ type: 'speed', id: activeId, speed: savedSpeed() });
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

    const cover = event.target.closest('[data-action="play"].edu-now-cover, .edu-now-cover');
    const button = event.target.closest('[data-action="play"]');
    if (!cover && !button) return;

    const card = event.target.closest('[data-episode-id]');
    const episode = getEpisode(card?.dataset.episodeId);
    if (!episode) return;

    if (activeId === episode.id && !audio.paused) {
      audio.pause();
      return;
    }
    loadEpisode(episode, { autoplay: true });
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.edu-speed-wrap')) return;
    closeSpeedMenus();
  });

  page.addEventListener('input', (event) => {
    const card = event.target.closest('[data-episode-id]');
    if (!card || !event.target.classList.contains('edu-seek')) return;
    const episode = getEpisode(card.dataset.episodeId);
    if (!episode) return;
    seeking = true;
    const stored = readProgress(episode.id);
    const duration = (activeId === episode.id && mediaDuration()) || stored.duration || 0;
    const next = (parseFloat(event.target.value) / 1000) * duration;
    card.querySelector('.edu-time-current').textContent = formatTime(next);
  });

  page.addEventListener('change', (event) => {
    if (!event.target.classList.contains('edu-seek')) return;
    const card = event.target.closest('[data-episode-id]');
    const episode = getEpisode(card.dataset.episodeId);
    if (!episode) return;

    const stored = readProgress(episode.id);
    const duration = (activeId === episode.id && mediaDuration()) || stored.duration || 0;
    const ratio = parseFloat(event.target.value) / 1000;
    const nextTime = ratio * duration;

    const applySeek = () => {
      if (mediaDuration()) {
        audio.currentTime = ratio * mediaDuration();
      }
      seeking = false;
      saveProgress();
      syncClock();
    };

    if (activeId !== episode.id || !audio.src) {
      loadEpisode(episode, { startTime: nextTime }).then(() => {
        seeking = false;
        saveProgress();
      });
      return;
    }

    applySeek();
  });

  page.addEventListener('pointerup', (event) => {
    if (!seeking || !event.target.classList.contains('edu-seek')) return;
    event.target.dispatchEvent(new Event('change', { bubbles: true }));
  });

  audio.addEventListener('play', () => {
    stopHold();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    setPlayingUi(true);
    applySpeed(savedSpeed(), { persist: false });
    startClock();
    saveProgress();
    publish({
      type: 'play',
      id: activeId,
      time: mediaTime(),
      duration: mediaDuration(),
      playing: true,
    });
  });

  audio.addEventListener('playing', () => {
    applySpeed(savedSpeed(), { persist: false });
    if (pendingRestore != null && pendingRestore > 3) {
      const restoreTo = pendingRestore;
      pendingRestore = null;
      const seek = () => {
        try {
          audio.currentTime = restoreTo;
          syncClock();
        } catch {
          // Mobile browsers reject seeks until they have a range.
        }
      };
      if (audio.readyState >= 2) seek();
      else audio.addEventListener('canplay', seek, { once: true });
    }
    startClock();
  });

  audio.addEventListener('pause', () => {
    setPlayingUi(false);
    stopClock();
    saveProgress();
    if (!audio.ended) startHold();
    else stopHold();
    publish({
      type: 'pause',
      id: activeId,
      time: mediaTime(),
      duration: mediaDuration(),
      playing: false,
    });
  });

  audio.addEventListener('timeupdate', syncClock);
  audio.addEventListener('durationchange', syncClock);
  audio.addEventListener('loadedmetadata', syncClock);
  audio.addEventListener('loadeddata', syncClock);
  audio.addEventListener('canplay', syncClock);

  audio.addEventListener('ended', () => {
    stopHold();
    stopClock();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    if (activeId) localStorage.removeItem(progressKey(activeId));
    setPlayingUi(false);
    const card = cardEl(activeId);
    if (card) updateTimes(card, 0, mediaDuration());
    publish({ type: 'ended', id: activeId, time: 0, duration: mediaDuration() });
  });

  window.addEventListener('pagehide', () => saveProgress());
  window.addEventListener('beforeunload', () => saveProgress());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveProgress();
      if (audio.paused && activeId && !audio.ended) startHold();
    }
  });

  if (channel) {
    channel.addEventListener('message', (event) => applyRemote(event.data));
  }

  window.addEventListener('storage', (event) => {
    if (event.key === SPEED_KEY) {
      applySpeed(savedSpeed(), { persist: false });
      return;
    }
    if (!event.key || !event.key.startsWith('edu-progress:')) return;
    const id = event.key.slice('edu-progress:'.length);
    const stored = readProgress(id);
    applyProgressUi(id, stored.time, stored.duration);
    if (activeId === id && audio.paused && stored.time && Math.abs(audio.currentTime - stored.time) > 1) {
      applyingRemote = true;
      audio.currentTime = stored.time;
      applyingRemote = false;
    }
  });

  function init() {
    try {
      const data = Array.isArray(window.EDU_EPISODES) ? window.EDU_EPISODES : [];
      episodes = data;
      if (redirectLegacyHash()) return;
      applySpeed(savedSpeed(), { persist: false });
      paintSavedProgress();
    } catch (error) {
      console.error('Error loading edu episodes:', error);
    }
  }

  init();
}
