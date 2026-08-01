// Corner selfie wall — fill tiles + fullscreen lightbox (arrow keys: younger/older)
document.addEventListener('DOMContentLoaded', async () => {
  const tiles = document.querySelectorAll('.selfie-tile[data-year]');
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

    // Left = younger, right = older
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepLightbox(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepLightbox(1);
    }
  });

  try {
    const response = await fetch('/api/corner/selfies');
    const data = await response.json();

    if (!data.success || !Array.isArray(data.selfies)) return;

    photoList = data.selfies
      .map((selfie) => ({
        year: Number(selfie.year),
        url: selfie.image_url
      }))
      .filter((item) => Number.isInteger(item.year) && item.year >= 0 && item.url)
      .sort((a, b) => a.year - b.year);

    photoList.forEach(({ year, url }) => {
      const tile = document.querySelector(`.selfie-tile[data-year="${year}"]`);
      if (!tile || tile.querySelector('img')) return;

      const img = document.createElement('img');
      img.src = url;
      img.alt = ageLabel(year);
      img.loading = 'lazy';
      img.decoding = 'async';
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
  } catch (error) {
    console.error('Error loading corner selfies:', error);
  }
});
