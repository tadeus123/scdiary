function collectAnswers(form) {
  const answers = {};
  form.querySelectorAll('textarea[name]').forEach((field) => {
    answers[field.name] = field.value;
  });
  return answers;
}

async function saveAnswers(answers) {
  const res = await fetch('/airsup/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ answers }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Could not save');
  }
  return data;
}

function initYouPage(form) {
  const status = document.getElementById('airsup-save-status');
  let timer = null;
  let dirty = false;

  function setStatus(text) {
    if (!status) return;
    status.hidden = !text;
    status.textContent = text || '';
  }

  form.addEventListener('input', () => {
    dirty = true;
    setStatus('saving…');
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await saveAnswers(collectAnswers(form));
        dirty = false;
        setStatus('saved');
      } catch (error) {
        setStatus(error.message);
      }
    }, 600);
  });

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
        body: JSON.stringify({ answers: collectAnswers(form) }),
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
