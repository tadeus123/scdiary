document.addEventListener('DOMContentLoaded', () => {
  const headlineInput = document.getElementById('eisenkind-headline-input');
  const bodyInput = document.getElementById('eisenkind-notes-input');
  const statusEl = document.getElementById('save-status');
  if (!headlineInput || !bodyInput || !statusEl) return;

  let saveTimer = null;
  let saving = false;

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  [headlineInput, bodyInput].forEach((el) => {
    autoResize(el);
    el.addEventListener('input', () => {
      autoResize(el);
      scheduleSave();
    });
    el.addEventListener('blur', () => {
      autoResize(el);
      window.clearTimeout(saveTimer);
      saveNotes();
    });
  });

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind || '';
  }

  async function saveNotes() {
    if (saving) return;
    saving = true;
    setStatus('saving…', 'pending');

    try {
      const response = await fetch('/admin/eisenkind/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: headlineInput.value,
          content: bodyInput.value
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }

      setStatus('saved', 'ok');
      window.setTimeout(() => {
        if (statusEl.dataset.kind === 'ok') setStatus('');
      }, 2000);
    } catch (error) {
      console.error('Error saving eisenkind notes:', error);
      setStatus('save failed', 'error');
    } finally {
      saving = false;
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNotes, 800);
  }
});
