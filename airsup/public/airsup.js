function collectAnswers(form) {
  const answers = {};
  form.querySelectorAll('.airsup-questions textarea[name]').forEach((field) => {
    answers[field.name] = field.value;
  });
  return answers;
}

function listFromBox(form, name) {
  const field = form.querySelector(`[name="${name}"]`);
  if (!field) return [];
  return field.value.split(/\n/).map((item) => item.trim()).filter(Boolean);
}

function collectMatchCard(form) {
  const context = form.querySelector('[name="short_context"]');
  return {
    can_help_with: listFromBox(form, 'can_help_with'),
    wants_help_with: listFromBox(form, 'wants_help_with'),
    people_they_want_to_meet: listFromBox(form, 'people_they_want_to_meet'),
    interests: listFromBox(form, 'interests'),
    short_context: context ? context.value.trim() : '',
  };
}

function fillMatchCard(form, card) {
  const map = {
    can_help_with: (card.can_help_with || []).join('\n'),
    wants_help_with: (card.wants_help_with || []).join('\n'),
    people_they_want_to_meet: (card.people_they_want_to_meet || []).join('\n'),
    interests: (card.interests || []).join('\n'),
    short_context: card.short_context || '',
  };
  Object.keys(map).forEach((name) => {
    const field = form.querySelector(`[name="${name}"]`);
    if (field) field.value = map[name];
  });
}

function collectPayload(form) {
  const consent = form.querySelector('[name="directory_consent"]');
  return {
    answers: collectAnswers(form),
    matchCard: collectMatchCard(form),
    directoryConsent: consent ? consent.checked : true,
  };
}

async function saveAnswers(payload, { keepalive } = {}) {
  const res = await fetch('/airsup/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: Boolean(keepalive),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Could not save');
  }
  return data;
}

function draftStorageKey(form) {
  const id = form.getAttribute('data-draft-key') || '';
  return id ? `airsup-you-draft:${id}` : '';
}

function writeLocalDraft(form) {
  const key = draftStorageKey(form);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      at: Date.now(),
      payload: collectPayload(form),
    }));
  } catch {
    /* private mode / quota */
  }
}

function readLocalDraft(form) {
  const key = draftStorageKey(form);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || !draft.payload || !draft.payload.answers) return null;
    return draft;
  } catch {
    return null;
  }
}

function applyPayload(form, payload) {
  const answers = payload.answers || {};
  form.querySelectorAll('.airsup-questions textarea[name]').forEach((field) => {
    if (typeof answers[field.name] === 'string') field.value = answers[field.name];
  });
  if (payload.matchCard) fillMatchCard(form, payload.matchCard);
  const consent = form.querySelector('[name="directory_consent"]');
  if (consent && typeof payload.directoryConsent === 'boolean') {
    consent.checked = payload.directoryConsent;
  }
}

function restoreLocalDraft(form) {
  const draft = readLocalDraft(form);
  if (!draft) return false;
  const serverUpdated = Date.parse(form.getAttribute('data-server-updated') || '');
  if (Number.isFinite(serverUpdated) && draft.at < serverUpdated) return false;
  applyPayload(form, draft.payload);
  return true;
}

function initYouPage(form) {
  const status = document.getElementById('airsup-save-status');
  const generate = document.getElementById('airsup-card-generate');
  let timer = null;
  let dirty = false;
  let saveSeq = 0;

  function setStatus(text) {
    if (!status) return;
    status.hidden = !text;
    status.textContent = text || '';
  }

  async function saveToServer(keepalive) {
    const seq = ++saveSeq;
    const payload = collectPayload(form);
    try {
      await saveAnswers(payload, { keepalive });
      if (seq !== saveSeq) return;
      dirty = false;
      writeLocalDraft(form);
      setStatus('saved');
    } catch (error) {
      if (seq !== saveSeq) return;
      setStatus(error.message);
    }
  }

  function scheduleSave() {
    dirty = true;
    writeLocalDraft(form);
    setStatus('saving…');
    clearTimeout(timer);
    timer = setTimeout(() => {
      saveToServer(false);
    }, 350);
  }

  if (restoreLocalDraft(form)) {
    dirty = true;
    setStatus('restored unsaved draft');
    scheduleSave();
  }

  form.addEventListener('input', scheduleSave);
  form.addEventListener('change', scheduleSave);

  if (generate) {
    generate.addEventListener('click', async () => {
      generate.disabled = true;
      setStatus('making card…');
      try {
        const res = await fetch('/airsup/api/card/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ answers: collectAnswers(form) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Could not build the public card');
        }
        fillMatchCard(form, data.card);
        scheduleSave();
        setStatus('card ready — correct it if needed');
      } catch (error) {
        setStatus(error.message);
      }
      generate.disabled = false;
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const finish = document.getElementById('airsup-finish');
    if (finish) finish.disabled = true;
    setStatus('saving…');
    try {
      const res = await fetch('/airsup/api/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(collectPayload(form)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Could not save');
      }
      dirty = false;
      if (data.setupUrl) {
        window.open(data.setupUrl, '_blank', 'noopener,noreferrer');
      }
      window.location.href = data.next || '/airsup/prompt';
    } catch (error) {
      setStatus(error.message);
      if (finish) finish.disabled = false;
    }
  });

  window.addEventListener('pagehide', () => {
    writeLocalDraft(form);
    if (dirty) saveToServer(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    writeLocalDraft(form);
    if (dirty) saveToServer(true);
  });
  window.addEventListener('beforeunload', (event) => {
    writeLocalDraft(form);
    if (!dirty) return;
    saveToServer(true);
    event.preventDefault();
    event.returnValue = '';
  });
}

function initPromptPage() {
  const button = document.getElementById('airsup-copy');
  const field = document.getElementById('airsup-prompt-text');
  if (!button || !field) return;
  const label = button.textContent;
  button.addEventListener('click', async () => {
    const text = field.value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      field.focus();
      field.select();
      document.execCommand('copy');
    }
    button.textContent = 'Copied';
    setTimeout(() => {
      button.textContent = label;
    }, 1600);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const youForm = document.getElementById('airsup-you-form');
  if (youForm) initYouPage(youForm);
  if (document.getElementById('airsup-copy')) initPromptPage();
});
