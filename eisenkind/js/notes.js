(function () {
  const overlay = document.getElementById('eisenkind-overlay');
  const openBtn = document.getElementById('eisenkind-motto-open');
  const notesBody = document.getElementById('eisenkind-notes-body');
  const sides = overlay ? overlay.querySelectorAll('[data-eisenkind-close]') : [];

  if (!overlay || !openBtn || !notesBody) return;

  let cache = null;
  let fetchPromise = null;

  function renderStory(story) {
    notesBody.innerHTML = '';
    notesBody.className = 'eisenkind-a4-body eisenkind-story';

    const trimmed = (story || '').trim();
    if (!trimmed) return;

    trimmed.split(/\n{2,}/).forEach((block) => {
      const paragraph = block.trim();
      if (!paragraph) return;
      const p = document.createElement('p');
      p.className = 'eisenkind-story-paragraph';
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
          cache = typeof data.story === 'string' ? data.story : '';
        }
      } catch (error) {
        console.error('Error loading eisenkind story:', error);
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
      renderStory(cache);
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('eisenkind-overlay-open');

    fetchNotes().then((fresh) => {
      if (typeof fresh === 'string' && overlay.classList.contains('is-open')) {
        renderStory(fresh);
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
