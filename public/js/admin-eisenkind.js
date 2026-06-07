document.addEventListener('DOMContentLoaded', () => {
  const headlineInput = document.getElementById('eisenkind-headline-input');
  const brainDumpInput = document.getElementById('eisenkind-brain-dump-input');
  const generateBtn = document.getElementById('eisenkind-generate-story');
  const storyPreview = document.getElementById('eisenkind-story-preview');
  const storyEmpty = document.getElementById('eisenkind-story-empty');
  const storyUpdatedLabel = document.getElementById('story-updated-label');
  const initialDataEl = document.getElementById('eisenkind-initial-data');
  const statusEl = document.getElementById('save-status');
  const progressWrap = document.getElementById('eisenkind-gen-progress');
  const progressTrack = document.getElementById('eisenkind-gen-progress-track');
  const progressBar = document.getElementById('eisenkind-gen-progress-bar');

  if (
    !headlineInput ||
    !brainDumpInput ||
    !generateBtn ||
    !storyPreview ||
    !storyEmpty ||
    !initialDataEl ||
    !statusEl ||
    !progressWrap ||
    !progressTrack ||
    !progressBar
  ) {
    return;
  }

  let story = '';
  let storyUpdatedAt = null;
  let saveTimer = null;
  let saving = false;
  let generating = false;
  let progressTimer = null;
  let generationStartedAt = 0;
  let lastProgressLabel = '';

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

  function formatElapsed(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function showGenerationProgress(show) {
    progressWrap.hidden = !show;
    progressWrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) {
      progressBar.style.width = '0%';
      progressTrack.setAttribute('aria-valuenow', '0');
    }
  }

  function updateGenerationProgress(percent, label, elapsedMs) {
    if (label) lastProgressLabel = label;

    const safePercent = Math.min(100, Math.max(0, Math.round(percent || 0)));
    progressBar.style.width = `${safePercent}%`;
    progressTrack.setAttribute('aria-valuenow', String(safePercent));

    const elapsed = formatElapsed(elapsedMs ?? Date.now() - generationStartedAt);
    setStatus(`${elapsed} · ${lastProgressLabel || 'working…'}`, 'pending');
  }

  function startProgressClock() {
    window.clearInterval(progressTimer);
    progressTimer = window.setInterval(() => {
      if (!generating) return;
      updateGenerationProgress(
        Number(progressTrack.getAttribute('aria-valuenow') || 0),
        lastProgressLabel,
        Date.now() - generationStartedAt
      );
    }, 1000);
  }

  function stopProgressClock() {
    window.clearInterval(progressTimer);
    progressTimer = null;
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

  async function postStoryStep(body) {
    const response = await fetch('/admin/eisenkind/generate-story/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Step failed (${response.status})`);
    }

    return data;
  }

  async function tryRecoverSavedStory() {
    try {
      const response = await fetch('/api/eisenkind/notes');
      const data = await response.json();
      if (data.success && typeof data.story === 'string' && data.story.trim()) {
        return data;
      }
    } catch {
      return null;
    }
    return null;
  }

  async function saveDraft() {
    if (saving || generating) return;
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
    generationStartedAt = Date.now();
    lastProgressLabel = 'starting…';
    showGenerationProgress(true);
    updateGenerationProgress(0, 'starting…', 0);
    startProgressClock();

    const existingStoryForRefine = story.trim();
    let beatSheet = '';
    let storySoFar = '';
    let stage = 1;
    let forceEnding = false;
    let succeeded = false;

    try {
      const plan = await postStoryStep({
        action: 'plan',
        headline: headlineInput.value,
        brain_dump: brainDumpInput.value
      });

      beatSheet = plan.beatSheet || '';
      updateGenerationProgress(plan.percent || 8, plan.label || 'planning story arc…', Date.now() - generationStartedAt);

      while (true) {
        const step = await postStoryStep({
          action: 'write',
          headline: headlineInput.value,
          brain_dump: brainDumpInput.value,
          beat_sheet: beatSheet,
          story_so_far: storySoFar,
          stage,
          force_ending: forceEnding,
          existing_story: stage === 1 && !storySoFar ? existingStoryForRefine : ''
        });

        storySoFar = step.story || storySoFar;
        updateGenerationProgress(
          step.percent || Number(progressTrack.getAttribute('aria-valuenow') || 0),
          step.label || lastProgressLabel,
          Date.now() - generationStartedAt
        );

        if (step.done) {
          story = step.notes?.story || storySoFar;
          storyUpdatedAt = step.notes?.story_updated_at || null;
          renderStoryPreview(story);
          succeeded = true;
          updateGenerationProgress(100, 'done', Date.now() - generationStartedAt);
          setStatus('story updated', 'ok');
          window.setTimeout(() => {
            if (statusEl.dataset.kind === 'ok') setStatus('');
          }, 3000);
          break;
        }

        stage = step.stage || stage + 1;
        forceEnding = Boolean(step.forceEndingNext);
      }
    } catch (error) {
      console.error('Error generating eisenkind story:', error);

      const recovered = await tryRecoverSavedStory();
      if (recovered?.story?.trim()) {
        story = recovered.story;
        storyUpdatedAt = recovered.story_updated_at || null;
        renderStoryPreview(story);
        setStatus('interrupted — partial story recovered. Run generate again to continue.', 'error');
      } else {
        const msg = error.message || 'generation failed';
        const friendly =
          /failed to fetch|network|suspended/i.test(msg)
            ? 'connection lost — keep this tab open and try again'
            : msg;
        setStatus(friendly.length > 100 ? `${friendly.slice(0, 97)}…` : friendly, 'error');
      }
    } finally {
      generating = false;
      generateBtn.disabled = false;
      stopProgressClock();
      if (succeeded) {
        window.setTimeout(() => showGenerationProgress(false), 900);
      } else {
        showGenerationProgress(false);
      }
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
