document.addEventListener('DOMContentLoaded', () => {
  const storyInput = document.getElementById('eisenkind-story-input');
  const storyPreview = document.getElementById('eisenkind-story-preview');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('save-status');

  if (!storyInput || !storyPreview || !saveBtn || !statusEl) return;

  let saveTimer = null;
  let saving = false;

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind || '';
  }

  function renderPreview(text) {
    storyPreview.innerHTML = '';
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    trimmed.split(/\n{2,}/).forEach((block) => {
      const paragraph = block.trim();
      if (!paragraph) return;
      const p = document.createElement('p');
      p.className = 'eisenkind-story-paragraph';
      p.textContent = paragraph;
      storyPreview.appendChild(p);
    });
  }

  async function saveStory() {
    if (saving) return;
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'saving…';
    setStatus('saving…', 'pending');

    try {
      const response = await fetch('/admin/eisenkind/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story: storyInput.value })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Save failed (${response.status})`);
      }

      setStatus('saved', 'ok');
      window.setTimeout(() => {
        if (statusEl.dataset.kind === 'ok') setStatus('');
      }, 2000);
    } catch (error) {
      console.error('Error saving eisenkind story:', error);
      const msg = error.message || 'save failed';
      setStatus(msg.length > 48 ? 'save failed — see console' : msg, 'error');
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'save';
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveStory, 1200);
  }

  storyInput.addEventListener('input', () => {
    renderPreview(storyInput.value);
    scheduleSave();
  });

  storyInput.addEventListener('blur', () => {
    window.clearTimeout(saveTimer);
    saveStory();
  });

  saveBtn.addEventListener('click', () => {
    window.clearTimeout(saveTimer);
    saveStory();
  });

  renderPreview(storyInput.value);
});
