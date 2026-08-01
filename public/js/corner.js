// Corner selfie wall — fill tiles + fullscreen lightbox for photos
document.addEventListener('DOMContentLoaded', async () => {
  const tiles = document.querySelectorAll('.selfie-tile[data-year]');
  if (!tiles.length) return;

  const lightbox = document.getElementById('selfie-lightbox');
  const lightboxImage = document.getElementById('selfie-lightbox-image');
  const lightboxCaption = document.getElementById('selfie-lightbox-caption');
  const lightboxClose = document.getElementById('selfie-lightbox-close');

  function openLightbox(url, year) {
    if (!lightbox || !lightboxImage || !url) return;

    lightboxImage.src = url;
    lightboxImage.alt = `Year ${year}`;
    if (lightboxCaption) {
      lightboxCaption.textContent = `Year ${year}`;
    }

    lightbox.hidden = false;
    document.body.classList.add('selfie-lightbox-open');

    // Trigger enter animation on next frame
    requestAnimationFrame(() => {
      lightbox.classList.add('is-open');
    });
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;

    lightbox.classList.remove('is-open');
    document.body.classList.remove('selfie-lightbox-open');

    const finish = () => {
      lightbox.hidden = true;
      if (lightboxImage) {
        lightboxImage.removeAttribute('src');
        lightboxImage.alt = '';
      }
      if (lightboxCaption) lightboxCaption.textContent = '';
    };

    // Match CSS transition; fall back if transitionend never fires
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

  function wireTile(tile, url, year) {
    tile.classList.add('has-image', 'is-clickable');
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('aria-label', `View year ${year} selfie`);

    const open = (event) => {
      event.preventDefault();
      openLightbox(url, year);
    };

    tile.addEventListener('click', open);
    tile.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLightbox(url, year);
      }
    });
  }

  if (lightbox) {
    lightbox.addEventListener('click', (event) => {
      // Close when tapping backdrop or the photo itself
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
    if (event.key === 'Escape') closeLightbox();
  });

  try {
    const response = await fetch('/api/corner/selfies');
    const data = await response.json();

    if (!data.success || !Array.isArray(data.selfies)) return;

    data.selfies.forEach((selfie) => {
      const year = Number(selfie.year);
      const url = selfie.image_url;
      if (!year || !url) return;

      const tile = document.querySelector(`.selfie-tile[data-year="${year}"]`);
      if (!tile || tile.querySelector('img')) return;

      const img = document.createElement('img');
      img.src = url;
      img.alt = `Year ${year}`;
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
      wireTile(tile, url, year);
    });
  } catch (error) {
    console.error('Error loading corner selfies:', error);
  }
});
