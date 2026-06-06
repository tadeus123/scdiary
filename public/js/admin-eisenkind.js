document.addEventListener('DOMContentLoaded', () => {
  const headlineInput = document.getElementById('eisenkind-headline-input');
  const brainDumpInput = document.getElementById('eisenkind-brain-dump-input');
  const generateBtn = document.getElementById('eisenkind-generate-story');
  const storyPreview = document.getElementById('eisenkind-story-preview');
  const storyEmpty = document.getElementById('eisenkind-story-empty');
  const storyUpdatedLabel = document.getElementById('story-updated-label');
  const initialDataEl = document.getElementById('eisenkind-initial-data');
  const statusEl = document.getElementById('save-status');

  if (
    !headlineInput ||
    !brainDumpInput ||
    !generateBtn ||
    !storyPreview ||
    !storyEmpty ||
    !initialDataEl ||
    !statusEl
  ) {
    return;
  }

  let story = '';
  let storyUpdatedAt = null;
  let saveTimer = null;
  let saving = false;
  let generating = false;

  try {
    const initial = JSON.parse(initialDataEl.textContent || '{}');
    story = typeof initial.story === 'string' ? initial.story : '';
    storyUpdatedAt = initial.story_updated_at || null;
  } catch {
    story = '';
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind || '';
  }

  function formatStoryUpdatedAt(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `updated ${date.toLocaleString()}`;
  }

  function renderStoryPreview(text) {
    storyPreview.innerHTML = '';
    const trimmed = (text || '').trim();

    if (!trimmed) {
      storyEmpty.hidden = false;
      if (storyUpdatedLabel) storyUpdatedLabel.textContent = '';
      return;
    }

    storyEmpty.hidden = true;
    if (storyUpdatedLabel) {
      storyUpdatedLabel.textContent = formatStoryUpdatedAt(storyUpdatedAt);
    }

    trimmed.split(/\n{2,}/).forEach((block) => {
      const paragraph = block.trim();
      if (!paragraph) return;
      const p = document.createElement('p');
      p.className = 'eisenkind-story-paragraph';
      p.textContent = paragraph;
      storyPreview.appendChild(p);
    });
  }

  async function saveDraft() {
    if (saving) return;
    saving = true;
    setStatus('saving…', 'pending');

    try {
      const response = await fetch('/admin/eisenkind/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: headlineInput.value,
          brain_dump: brainDumpInput.value
        })
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
      console.error('Error saving eisenkind notes:', error);
      const msg = error.message || 'save failed';
      setStatus(msg.length > 48 ? 'save failed — see console' : msg, 'error');
    } finally {
      saving = false;
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 800);
  }

  async function generateStory() {
    if (generating) return;

    if (!brainDumpInput.value.trim()) {
      setStatus('add a brain dump first', 'error');
      return;
    }

    generating = true;
    generateBtn.disabled = true;
    setStatus('writing story (may take a few minutes)…', 'pending');

    try {
      const response = await fetch('/admin/eisenkind/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: headlineInput.value,
          brain_dump: brainDumpInput.value
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Generation failed (${response.status})`);
      }

      story = data.notes?.story || '';
      storyUpdatedAt = data.notes?.story_updated_at || null;
      renderStoryPreview(story);
      setStatus('story updated', 'ok');
      window.setTimeout(() => {
        if (statusEl.dataset.kind === 'ok') setStatus('');
      }, 3000);
    } catch (error) {
      console.error('Error generating eisenkind story:', error);
      const msg = error.message || 'generation failed';
      setStatus(msg.length > 100 ? `${msg.slice(0, 97)}…` : msg, 'error');
    } finally {
      generating = false;
      generateBtn.disabled = false;
    }
  }

  [headlineInput, brainDumpInput].forEach((el) => {
    autoResize(el);
    el.addEventListener('input', () => {
      autoResize(el);
      scheduleSave();
    });
    el.addEventListener('blur', () => {
      autoResize(el);
      window.clearTimeout(saveTimer);
      saveDraft();
    });
  });

  generateBtn.addEventListener('click', generateStory);

  renderStoryPreview(story);
  autoResize(headlineInput);
  autoResize(brainDumpInput);
});
