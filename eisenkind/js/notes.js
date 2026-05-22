(function () {
  const overlay = document.getElementById('eisenkind-overlay');
  const openBtn = document.getElementById('eisenkind-motto-open');
  const headlineEl = document.getElementById('eisenkind-a4-headline');
  const notesBody = document.getElementById('eisenkind-notes-body');
  const sides = overlay ? overlay.querySelectorAll('[data-eisenkind-close]') : [];

  if (!overlay || !openBtn || !headlineEl || !notesBody) return;

  const DEFAULT_HEADLINE =
    'How to make humanoid robots that we love and that spread love?';

  function openOverlay() {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('eisenkind-overlay-open');
    loadNotes();
  }

  function closeOverlay() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('eisenkind-overlay-open');
    openBtn.focus();
  }

  function renderBody(text) {
    notesBody.innerHTML = '';
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    trimmed.split(/\n{2,}/).forEach((block) => {
      const paragraph = block.trim();
      if (!paragraph) return;
      const p = document.createElement('p');
      p.textContent = paragraph;
      notesBody.appendChild(p);
    });
  }

  async function loadNotes() {
    notesBody.innerHTML = '';
    headlineEl.textContent = DEFAULT_HEADLINE;

    try {
      const response = await fetch('/api/eisenkind/notes');
      const data = await response.json();
      if (data.success) {
        headlineEl.textContent = data.headline || DEFAULT_HEADLINE;
        renderBody(data.content);
      }
    } catch (error) {
      console.error('Error loading eisenkind notes:', error);
    }
  }

  openBtn.addEventListener('click', openOverlay);

  sides.forEach((side) => {
    side.addEventListener('click', closeOverlay);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
      closeOverlay();
    }
  });
})();
