(function () {
  const overlay = document.getElementById('eisenkind-overlay');
  const openBtn = document.getElementById('eisenkind-motto-open');
  const headlineEl = document.getElementById('eisenkind-a4-headline');
  const notesBody = document.getElementById('eisenkind-notes-body');
  const sides = overlay ? overlay.querySelectorAll('[data-eisenkind-close]') : [];

  if (!overlay || !openBtn || !headlineEl || !notesBody) return;

  const DEFAULT_HEADLINE =
    'How to make humanoid robots that we love and that spread love?';

  let cache = null;
  let fetchPromise = null;

  function applyNotes(notes) {
    if (!notes) return;
    headlineEl.textContent = notes.headline || DEFAULT_HEADLINE;
    renderBody(notes.content);
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

  async function fetchNotes() {
    if (fetchPromise) return fetchPromise;

    fetchPromise = (async () => {
      try {
        const response = await fetch('/api/eisenkind/notes');
        const data = await response.json();
        if (data.success) {
          cache = {
            headline: data.headline || DEFAULT_HEADLINE,
            content: data.content || ''
          };
        }
      } catch (error) {
        console.error('Error loading eisenkind notes:', error);
      } finally {
        fetchPromise = null;
      }
      return cache;
    })();

    return fetchPromise;
  }

  async function openOverlay() {
    if (!cache) {
      await fetchNotes();
    }

    if (cache) {
      applyNotes(cache);
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('eisenkind-overlay-open');

    fetchNotes().then((fresh) => {
      if (fresh && overlay.classList.contains('is-open')) {
        applyNotes(fresh);
      }
    });
  }

  function closeOverlay() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('eisenkind-overlay-open');
    openBtn.focus();
  }

  openBtn.addEventListener('click', () => {
    openOverlay();
  });

  sides.forEach((side) => {
    side.addEventListener('click', closeOverlay);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
      closeOverlay();
    }
  });

  fetchNotes();
})();
