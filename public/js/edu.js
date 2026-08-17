const SPEED_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5];
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
let lastLockEpisodeId = '';
let lastLockMetaAt = 0;

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
  const sameEpisode = lastLockEpisodeId === episode.id && navigator.mediaSession.metadata;
  if (sameEpisode && label === lastLockLabel) {
    updatePositionState();
    return;
  }
  // Rewriting metadata every second makes Android drop the seek bar.
  if (sameEpisode && Date.now() - lastLockMetaAt < 5000) {
    updatePositionState();
    return;
  }
  lastLockEpisodeId = episode.id;
  lastLockLabel = label;
  lastLockMetaAt = Date.now();
  navigator.mediaSession.metadata = new MediaMetadata({
    title: episode.name,
    artist: label,
    album: 'edu',
    artwork: sessionArtwork(episode),
  });
  updatePositionState();
}

function bindSessionHandlers() {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    const duration = mediaDuration();
    if (!duration || !Number.isFinite(details.seekTime)) return;
    const next = Math.min(duration, Math.max(0, details.seekTime));
    if (details.fastSeek && 'fastSeek' in audio) audio.fastSeek(next);
    else audio.currentTime = next;
    saveProgress();
    syncClock();
  });

  // Skip handlers make Android show ± buttons instead of a scrubber.
  ['seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'stop'].forEach((action) => {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      // Older browsers throw for unsupported action names.
    }
  });
}

function updateMediaSession(episode) {
  if (!('mediaSession' in navigator) || !episode) return;
  lastLockLabel = '';
  lastLockEpisodeId = '';
  lastLockMetaAt = 0;
  bindSessionHandlers();
  updateLockTimes();
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
  const duration = mediaDuration();
  if (!Number.isFinite(duration) || duration <= 0) return;
  const position = Math.min(Math.max(0, mediaTime()), duration);
  const playbackRate = audio.paused ? 1 : (Number(audio.playbackRate) || 1);
  const state = {
    duration: Number(duration.toFixed(3)),
    position: Number(Math.min(position, duration).toFixed(3)),
    playbackRate: Number((playbackRate > 0 ? playbackRate : 1).toFixed(3)),
  };
  try {
    navigator.mediaSession.setPositionState(state);
  } catch {
    try {
      navigator.mediaSession.setPositionState({
        duration: state.duration,
        position: state.position,
        playbackRate: 1,
      });
    } catch {
      // Some browsers reject position updates while metadata is settling.
    }
  }
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function latin1Bytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function utf16beBytes(text) {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xfe;
  out[1] = 0xff;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out[2 + i * 2] = (code >> 8) & 0xff;
    out[3 + i * 2] = code & 0xff;
  }
  return out;
}

function u32be(value) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function synchsafe(value) {
  return new Uint8Array([
    (value >>> 21) & 0x7f,
    (value >>> 14) & 0x7f,
    (value >>> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function id3Frame(id, body) {
  return concatBytes([latin1Bytes(id), u32be(body.length), new Uint8Array([0, 0]), body]);
}

function id3TextFrame(id, value) {
  return id3Frame(id, concatBytes([new Uint8Array([1]), utf16beBytes(String(value || ''))]));
}

function id3CoverFrame(jpeg) {
  return id3Frame('APIC', concatBytes([
    new Uint8Array([0]),
    latin1Bytes('image/jpeg'),
    new Uint8Array([0, 3, 0]),
    jpeg,
  ]));
}

function buildId3(frames) {
  const body = concatBytes(frames);
  return concatBytes([
    latin1Bytes('ID3'),
    new Uint8Array([3, 0, 0]),
    synchsafe(body.length),
    body,
  ]);
}

function stripId3(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return bytes;
  }
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const skip = 10 + size + ((bytes[5] & 0x10) ? 10 : 0);
  return bytes.subarray(Math.min(skip, bytes.length));
}

function mp3Filename(name) {
  const safe = String(name || 'conversation').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '').trim();
  return `${safe || 'conversation'}.mp3`;
}

function coverJpeg(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      const side = Math.min(image.naturalWidth, image.naturalHeight) || size;
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;
      context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('cover'));
          return;
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
      }, 'image/jpeg', 0.88);
    };
    image.onerror = () => reject(new Error('cover'));
    image.src = absoluteUrl(src);
  });
}

async function saveMp3File(file) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (ios && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function downloadEpisode(episode) {
  if (!episode?.audio) return;
  const buttons = page.querySelectorAll(`[data-episode-id="${episode.id}"] [data-action="download"]`);
  if ([...buttons].some((button) => button.classList.contains('is-busy'))) return;
  buttons.forEach((button) => {
    button.classList.add('is-busy');
    button.setAttribute('aria-busy', 'true');
  });
  try {
    const [audioBuffer, cover] = await Promise.all([
      fetch(episode.audio).then((response) => {
        if (!response.ok) throw new Error('audio');
        return response.arrayBuffer();
      }),
      coverJpeg(episode.image).catch(() => null),
    ]);
    const mpeg = stripId3(new Uint8Array(audioBuffer));
    const frames = [
      id3TextFrame('TIT2', episode.name),
      id3TextFrame('TPE1', 'edu'),
      id3TextFrame('TALB', 'edu'),
    ];
    if (cover) frames.push(id3CoverFrame(cover));
    const tagged = concatBytes([buildId3(frames), mpeg]);
    const file = new File([tagged], mp3Filename(episode.name), { type: 'audio/mpeg' });
    await saveMp3File(file);
  } catch (error) {
    console.error('Could not download conversation:', error);
    const link = document.createElement('a');
    link.href = episode.audio;
    link.download = mp3Filename(episode.name);
    link.rel = 'noopener';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    buttons.forEach((button) => {
      button.classList.remove('is-busy');
      button.removeAttribute('aria-busy');
    });
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

    const downloadBtn = event.target.closest('[data-action="download"]');
    if (downloadBtn) {
      event.preventDefault();
      closeSpeedMenus();
      const card = event.target.closest('[data-episode-id]');
      const episode = getEpisode(card?.dataset.episodeId);
      if (episode) downloadEpisode(episode);
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
    bindSessionHandlers();
    lastLockMetaAt = 0;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    setPlayingUi(true);
    applySpeed(savedSpeed(), { persist: false });
    startClock();
    updateLockTimes();
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
