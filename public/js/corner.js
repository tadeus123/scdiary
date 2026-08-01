// Corner selfie wall — parallel eager load + fullscreen lightbox
document.addEventListener('DOMContentLoaded', async () => {
  const tiles = document.querySelectorAll('.selfie-tile[data-year]');
  const wall = document.querySelector('.selfie-wall');
  if (!tiles.length) return;

  const lightbox = document.getElementById('selfie-lightbox');
  const lightboxImage = document.getElementById('selfie-lightbox-image');
  const lightboxCaption = document.getElementById('selfie-lightbox-caption');
  const lightboxClose = document.getElementById('selfie-lightbox-close');

  /** @type {{ year: number, url: string }[]} */
  let photoList = [];
  let currentIndex = -1;

  function ageLabel(year) {
    return String(year);
  }

  function showLightboxPhoto(index) {
    if (!lightbox || !lightboxImage || !photoList.length) return;
    if (index < 0 || index >= photoList.length) return;

    currentIndex = index;
    const { year, url } = photoList[currentIndex];

    lightboxImage.src = url;
    lightboxImage.alt = ageLabel(year);
    if (lightboxCaption) {
      lightboxCaption.textContent = ageLabel(year);
    }
  }

  function openLightbox(year) {
    if (!lightbox || !lightboxImage) return;

    const index = photoList.findIndex((item) => item.year === year);
    if (index < 0) return;

    showLightboxPhoto(index);
    lightbox.hidden = false;
    document.body.classList.add('selfie-lightbox-open');

    requestAnimationFrame(() => {
      lightbox.classList.add('is-open');
    });
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;

    lightbox.classList.remove('is-open');
    document.body.classList.remove('selfie-lightbox-open');
    currentIndex = -1;

    const finish = () => {
      lightbox.hidden = true;
      if (lightboxImage) {
        lightboxImage.removeAttribute('src');
        lightboxImage.alt = '';
      }
      if (lightboxCaption) lightboxCaption.textContent = '';
    };

    let done = false;
    const onEnd = (event) => {
      if (event.target !== lightbox) return;
      done = true;
      lightbox.removeEventListener('transitionend', onEnd);
      finish();
    };
    lightbox.addEventListener('transitionend', onEnd);
    setTimeout(() => {
      if (!done) {
        lightbox.removeEventListener('transitionend', onEnd);
        finish();
      }
    }, 280);
  }

  function stepLightbox(delta) {
    if (!lightbox || lightbox.hidden || currentIndex < 0 || !photoList.length) return;
    const next = currentIndex + delta;
    if (next < 0 || next >= photoList.length) return;
    showLightboxPhoto(next);
  }

  function wireTile(tile, year) {
    tile.classList.add('has-image', 'is-clickable');
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('aria-label', `View age ${year}`);

    const open = (event) => {
      event.preventDefault();
      openLightbox(year);
    };

    tile.addEventListener('click', open);
    tile.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLightbox(year);
      }
    });
  }

  function revealWall() {
    if (!wall) return;
    wall.classList.remove('is-loading');
    wall.classList.add('is-ready');
  }

  function loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (typeof img.decode === 'function') {
          img.decode().then(() => resolve(img)).catch(() => resolve(img));
        } else {
          resolve(img);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function populateTiles(list) {
    photoList = list;

    if (!photoList.length) {
      revealWall();
      return;
    }

    // Start every download immediately in parallel (don't wait forever on one slow file)
    const LOAD_TIMEOUT_MS = 8000;
    const loaded = await Promise.all(
      photoList.map(async (item) => {
        const decoded = await Promise.race([
          loadImage(item.url),
          new Promise((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS))
        ]);
        return decoded ? item : null;
      })
    );

    const ready = loaded.filter(Boolean);

    // Mount all successful images together, then reveal once
    ready.forEach(({ year, url }) => {
      const tile = document.querySelector(`.selfie-tile[data-year="${year}"]`);
      if (!tile || tile.querySelector('img')) return;

      const img = document.createElement('img');
      img.src = url;
      img.alt = ageLabel(year);
      img.loading = 'eager';
      img.decoding = 'sync';
      img.fetchPriority = 'high';
      img.onerror = () => {
        img.remove();
        tile.classList.remove('has-image', 'is-clickable');
        tile.removeAttribute('role');
        tile.removeAttribute('tabindex');
        tile.removeAttribute('aria-label');
      };

      tile.prepend(img);
      wireTile(tile, year);
    });

    photoList = ready;
    revealWall();
  }

  if (lightbox) {
    lightbox.addEventListener('click', (event) => {
      if (
        event.target === lightbox ||
        event.target === lightboxImage ||
        event.target.classList.contains('selfie-lightbox-figure')
      ) {
        closeLightbox();
      }
    });
  }

  if (lightboxClose) {
    lightboxClose.addEventListener('click', (event) => {
      event.stopPropagation();
      closeLightbox();
    });
  }

  window.addEventListener('keydown', (event) => {
    if (!lightbox || lightbox.hidden) return;

    if (event.key === 'Escape') {
      closeLightbox();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepLightbox(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepLightbox(1);
    }
  });

  function normalizeSelfies(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((selfie) => ({
        year: Number(selfie.year),
        url: selfie.image_url || selfie.url
      }))
      .filter((item) => Number.isInteger(item.year) && item.year >= 0 && item.url)
      .sort((a, b) => a.year - b.year);
  }

  try {
    let list = normalizeSelfies(window.__cornerSelfies__);

    // Fallback if page was served without embedded data
    if (!list.length) {
      const response = await fetch('/api/corner/selfies');
      const data = await response.json();
      if (data.success) {
        list = normalizeSelfies(data.selfies);
      }
    }

    await populateTiles(list);
  } catch (error) {
    console.error('Error loading corner selfies:', error);
    revealWall();
  }
});
