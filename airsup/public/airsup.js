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

async function saveAnswers(payload) {
  const res = await fetch('/airsup/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Could not save');
  }
  return data;
}

function initYouPage(form) {
  const status = document.getElementById('airsup-save-status');
  const generate = document.getElementById('airsup-card-generate');
  let timer = null;
  let dirty = false;

  function setStatus(text) {
    if (!status) return;
    status.hidden = !text;
    status.textContent = text || '';
  }

  function scheduleSave() {
    dirty = true;
    setStatus('saving…');
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await saveAnswers(collectPayload(form));
        dirty = false;
        setStatus('saved');
      } catch (error) {
        setStatus(error.message);
      }
    }, 600);
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
        dirty = true;
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

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function initPromptPage() {
  const button = document.getElementById('airsup-copy');
  const field = document.getElementById('airsup-prompt-text');
  if (!button || !field) return;
  button.addEventListener('click', async () => {
    const text = field.value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      field.focus();
      field.select();
      document.execCommand('copy');
    }
    const url = button.getAttribute('data-chatgpt-url') || 'https://chatgpt.com/';
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const youForm = document.getElementById('airsup-you-form');
  if (youForm) initYouPage(youForm);
  if (document.getElementById('airsup-copy')) initPromptPage();
});
