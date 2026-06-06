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

  function formatEntryDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function applyNotes(notes) {
    if (!notes) return;
    headlineEl.textContent = notes.headline || DEFAULT_HEADLINE;
    renderBlocks(notes.blocks || []);
  }

  function renderBlocks(blocks) {
    notesBody.innerHTML = '';

    if (!Array.isArray(blocks) || !blocks.length) return;

    blocks.forEach((block) => {
      if (!block || typeof block.text !== 'string' || !block.text.trim()) return;

      const type = block.type || 'note';
      const article = document.createElement('article');
      article.className = `eisenkind-block eisenkind-block--${type}`;

      if (type === 'entry' && block.date) {
        const dateEl = document.createElement('time');
        dateEl.className = 'eisenkind-block-date-label';
        dateEl.dateTime = block.date;
        dateEl.textContent = formatEntryDate(block.date);
        article.appendChild(dateEl);
      }

      const textEl = document.createElement('p');
      textEl.className = 'eisenkind-block-text';
      textEl.textContent = block.text.trim();
      article.appendChild(textEl);

      notesBody.appendChild(article);
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
            blocks: Array.isArray(data.blocks) ? data.blocks : []
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
