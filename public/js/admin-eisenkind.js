document.addEventListener('DOMContentLoaded', () => {
  const storyInput = document.getElementById('eisenkind-story-input');
  const storyPreview = document.getElementById('eisenkind-story-preview');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('save-status');
  const hoursForm = document.getElementById('kind-hours-form');
  const hoursInput = document.getElementById('kindHours');
  const dateInput = document.getElementById('kindDateLogged');
  const hoursMessage = document.getElementById('kind-hours-message');
  const hoursList = document.getElementById('kind-hours-list');

  if (!storyInput || !storyPreview || !saveBtn || !statusEl) return;

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

  function showHoursMessage(text, type) {
    if (!hoursMessage) return;
    hoursMessage.textContent = text;
    hoursMessage.className = `form-message ${type || ''}`;
  }

  function formatHours(value) {
    const n = Math.round(Number(value) * 100) / 100;
    return Number.isInteger(n) ? String(n) : String(n);
  }

  function formatDate(dateStr) {
    const d = new Date(String(dateStr).includes('T') ? dateStr : `${dateStr}T12:00:00`);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function renderHoursList(entries) {
    if (!hoursList) return;

    if (!entries.length) {
      hoursList.innerHTML = '<p class="kind-hours-empty">no hours logged yet.</p>';
      return;
    }

    const sorted = [...entries].sort((a, b) => {
      const da = new Date(a.date_logged) - new Date(b.date_logged);
      if (da !== 0) return -da;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    hoursList.innerHTML = sorted.map((entry) => `
      <div class="kind-hours-row" data-id="${entry.id}">
        <span class="kind-hours-row-meta">
          ${formatHours(entry.hours)} hour${Number(entry.hours) === 1 ? '' : 's'}
          ·
          ${formatDate(entry.date_logged)}
        </span>
        <button type="button" class="btn btn-secondary kind-hours-delete" data-id="${entry.id}">delete</button>
      </div>
    `).join('');
  }

  async function refreshHoursList() {
    const response = await fetch(`/api/kind/hours?t=${Date.now()}`, {
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await response.json();
    if (data.success) {
      renderHoursList(data.entries || []);
    }
  }

  if (hoursForm && hoursInput && dateInput) {
    hoursForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hours = Number(hoursInput.value);
      const dateLogged = dateInput.value;

      if (!Number.isFinite(hours) || hours <= 0) {
        showHoursMessage('Please enter a positive number of hours', 'error');
        return;
      }
      if (!dateLogged) {
        showHoursMessage('Please select a date', 'error');
        return;
      }

      // Accept any calendar date (past or future) — same as bookshelf Date Read
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLogged)) {
        showHoursMessage('Please enter a valid date', 'error');
        return;
      }

      const submitBtn = hoursForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'adding…';
      }

      try {
        const response = await fetch('/admin/eisenkind/hours', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hours, dateLogged })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to add hours');
        }

        showHoursMessage('Hours added', 'success');
        hoursInput.value = '';
        dateInput.value = '';
        await refreshHoursList();
        window.setTimeout(() => showHoursMessage(''), 2000);
      } catch (error) {
        console.error('Error adding kind hours:', error);
        showHoursMessage(error.message || 'Failed to add hours', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Add Hours';
        }
      }
    });

    hoursList?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.kind-hours-delete');
      if (!btn) return;

      const id = btn.dataset.id;
      if (!id || !confirm('Delete this hours entry?')) return;

      btn.disabled = true;
      try {
        const response = await fetch(`/admin/eisenkind/hours/${id}`, {
          method: 'DELETE'
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to delete');
        }
        await refreshHoursList();
        showHoursMessage('Deleted', 'success');
        window.setTimeout(() => showHoursMessage(''), 2000);
      } catch (error) {
        console.error('Error deleting kind hours:', error);
        showHoursMessage(error.message || 'Failed to delete', 'error');
        btn.disabled = false;
      }
    });
  }

  storyInput.addEventListener('input', () => {
    renderPreview(storyInput.value);
  });

  saveBtn.addEventListener('click', saveStory);

  renderPreview(storyInput.value);
});
