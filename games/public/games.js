(function () {
  const data = window.GAMES || {};
  const phrases = Array.isArray(data.phrases) ? data.phrases.slice() : [];
  const roundMs = Math.max(1, Number(data.roundSeconds) || 45) * 1000;

  const idleEl = document.getElementById('idle');
  const playEl = document.getElementById('play');
  const resultsEl = document.getElementById('results');
  const lineEl = document.getElementById('line');
  const catchEl = document.getElementById('typecatch');
  const againEl = document.getElementById('again');

  const statWpm = document.getElementById('stat-wpm');
  const statMistakes = document.getElementById('stat-mistakes');
  const statTime = document.getElementById('stat-time');
  const statScore = document.getElementById('stat-score');
  const statBest = document.getElementById('stat-best');
  const resultScore = document.getElementById('result-score');
  const resultWpm = document.getElementById('result-wpm');
  const resultMistakes = document.getElementById('result-mistakes');
  const resultBeat = document.getElementById('result-beat');

  let highscore = data.highscore && typeof data.highscore === 'object'
    ? data.highscore
    : { score: 0, wpm: 0, mistakes: 0 };

  let mode = 'idle';
  let queue = [];
  let phraseIndex = 0;
  let cursor = 0;
  let correctChars = 0;
  let mistakes = 0;
  let startedAt = 0;
  let timerId = null;
  let missUntil = 0;
  let allowRestartAt = 0;

  function computeWpm(chars, elapsed) {
    if (chars <= 0 || elapsed <= 0) return 0;
    return (chars / 5) / (elapsed / 60000);
  }

  function computeScore(wpm, miss) {
    return Math.max(0, Math.round(wpm * 10) - miss * 20);
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function escapeHtml(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '"') return '&quot;';
    return ch;
  }

  function currentPhrase() {
    return queue[phraseIndex] || '';
  }

  function renderLine() {
    const text = currentPhrase();
    const miss = Date.now() < missUntil;
    let html = '';
    for (let i = 0; i < text.length; i += 1) {
      let cls = 'rest';
      if (i < cursor) cls = 'ok';
      else if (i === cursor) cls = miss ? 'caret miss' : 'caret';
      html += '<span class="' + cls + '">' + escapeHtml(text[i]) + '</span>';
    }
    lineEl.innerHTML = html || '&nbsp;';
  }

  function setMode(next) {
    mode = next;
    idleEl.hidden = next !== 'idle';
    playEl.hidden = next !== 'play';
    resultsEl.hidden = next !== 'results';
  }

  function paintStats(elapsed) {
    const remain = Math.max(0, Math.ceil((roundMs - elapsed) / 1000));
    const wpm = computeWpm(correctChars, elapsed);
    const score = computeScore(wpm, mistakes);
    statWpm.textContent = String(Math.round(wpm));
    statMistakes.textContent = String(mistakes);
    statTime.textContent = String(remain);
    statScore.textContent = String(score);
    statBest.textContent = String(highscore.score || 0);
    return { wpm, score, remain };
  }

  function nextPhrase() {
    phraseIndex += 1;
    if (phraseIndex >= queue.length) {
      const last = queue[queue.length - 1];
      queue = shuffle(phrases);
      if (queue[0] === last && queue.length > 1) {
        const swap = queue[1];
        queue[1] = queue[0];
        queue[0] = swap;
      }
      phraseIndex = 0;
    }
    cursor = 0;
    renderLine();
  }

  function finish() {
    if (mode !== 'play') return;
    window.clearInterval(timerId);
    timerId = null;
    const elapsed = Math.min(roundMs, Date.now() - startedAt);
    const wpm = computeWpm(correctChars, elapsed);
    const score = computeScore(wpm, mistakes);
    paintStats(roundMs);
    resultScore.textContent = String(score);
    resultWpm.textContent = String(Math.round(wpm));
    resultMistakes.textContent = String(mistakes);
    allowRestartAt = Date.now() + 1000;
    setMode('results');

    fetch('/games/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, wpm, mistakes }),
    })
      .then(function (res) { return res.json(); })
      .then(function (payload) {
        if (!payload || !payload.success || !payload.highscore) return;
        const previous = Number(highscore.score) || 0;
        highscore = payload.highscore;
        statBest.textContent = String(highscore.score || 0);
        resultBeat.hidden = !(payload.updated && score > previous);
      })
      .catch(function () {});
  }

  function tick() {
    const elapsed = Date.now() - startedAt;
    paintStats(elapsed);
    if (elapsed >= roundMs) finish();
  }

  function startRound() {
    queue = shuffle(phrases);
    phraseIndex = 0;
    cursor = 0;
    correctChars = 0;
    mistakes = 0;
    startedAt = Date.now();
    missUntil = 0;
    resultBeat.hidden = true;
    setMode('play');
    renderLine();
    paintStats(0);
    window.clearInterval(timerId);
    timerId = window.setInterval(tick, 100);
    catchEl.value = '';
    catchEl.focus();
  }

  function onKey(key) {
    if (mode === 'idle') {
      if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta' || key === 'Tab') return;
      startRound();
      return;
    }
    if (mode !== 'play') return;

    const text = currentPhrase();
    if (!text) return;

    if (key === 'Backspace') {
      if (cursor > 0) {
        cursor -= 1;
        correctChars = Math.max(0, correctChars - 1);
        renderLine();
      }
      return;
    }

    if (key.length !== 1) return;

    const expected = text[cursor];
    if (key === expected) {
      cursor += 1;
      correctChars += 1;
      missUntil = 0;
      if (cursor >= text.length) nextPhrase();
      else renderLine();
    } else {
      mistakes += 1;
      missUntil = Date.now() + 140;
      renderLine();
      window.setTimeout(function () {
        if (Date.now() >= missUntil) renderLine();
      }, 150);
    }
    paintStats(Date.now() - startedAt);
  }

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (mode === 'results') {
      event.preventDefault();
      if (event.key === 'Enter' && Date.now() >= allowRestartAt) startRound();
      return;
    }
    if (event.key === 'Tab') return;
    if (event.key === 'Backspace' || event.key.length === 1) event.preventDefault();
    onKey(event.key);
  });

  catchEl.addEventListener('input', function () {
    const value = catchEl.value;
    catchEl.value = '';
    if (!value) return;
    if (mode === 'idle') startRound();
    for (let i = 0; i < value.length; i += 1) onKey(value[i]);
  });

  idleEl.addEventListener('click', function (event) {
    event.stopPropagation();
    if (mode === 'idle') startRound();
  });

  againEl.addEventListener('click', function () {
    startRound();
  });

  document.addEventListener('click', function () {
    catchEl.focus();
  });

  paintStats(0);
})();
