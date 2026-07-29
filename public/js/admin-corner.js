// Admin corner selfie wall — click tile to upload, × to delete
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('selfie-file-input');
  const tiles = Array.from(document.querySelectorAll('.selfie-tile[data-year]'));
  if (!fileInput || !tiles.length) return;

  let activeYear = null;

  // Vercel serverless body limit is ~4.5MB; keep uploads safely under that.
  const MAX_EDGE = 1400;
  const JPEG_QUALITY = 0.84;
  const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

  function setTileImage(tile, url) {
    const year = tile.dataset.year;
    let img = tile.querySelector('img');
    const deleteBtn = tile.querySelector('.selfie-tile-delete');

    if (url) {
      if (!img) {
        img = document.createElement('img');
        img.alt = `Year ${year}`;
        img.decoding = 'async';
        tile.insertBefore(img, tile.firstChild);
      }
      img.src = url;
      tile.classList.add('has-image');
      if (deleteBtn) deleteBtn.hidden = false;
    } else {
      if (img) img.remove();
      tile.classList.remove('has-image');
      if (deleteBtn) deleteBtn.hidden = true;
    }
  }

  async function parseJsonResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      if (response.status === 413 || /entity too large/i.test(text)) {
        throw new Error('Image is too large. Try a smaller photo.');
      }
      throw new Error(text.trim().slice(0, 120) || `Upload failed (${response.status})`);
    }
  }

  async function prepareSelfieFile(file) {
    if (!window.SelfieFaceCrop || typeof window.SelfieFaceCrop.cropPortraitSelfie !== 'function') {
      throw new Error('Face crop helper failed to load. Refresh and try again.');
    }

    return window.SelfieFaceCrop.cropPortraitSelfie(file, {
      maxEdge: MAX_EDGE,
      quality: JPEG_QUALITY,
      maxBytes: MAX_UPLOAD_BYTES
    });
  }

  async function loadSelfies() {
    try {
      const response = await fetch('/api/corner/selfies');
      const data = await parseJsonResponse(response);
      if (!data.success || !Array.isArray(data.selfies)) return;

      data.selfies.forEach((selfie) => {
        const tile = document.querySelector(`.selfie-tile[data-year="${selfie.year}"]`);
        if (tile && selfie.image_url) {
          setTileImage(tile, selfie.image_url);
        }
      });
    } catch (error) {
      console.error('Error loading corner selfies:', error);
    }
  }

  async function uploadSelfie(year, file) {
    const tile = document.querySelector(`.selfie-tile[data-year="${year}"]`);
    if (!tile) return;

    tile.classList.add('is-uploading');

    try {
      const prepared = await prepareSelfieFile(file);
      const formData = new FormData();
      formData.append('selfie', prepared);

      const response = await fetch(`/admin/corner/selfie/${year}`, {
        method: 'POST',
        body: formData
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      setTileImage(tile, data.selfie.image_url);
    } catch (error) {
      console.error('Error uploading selfie:', error);
      alert(error.message || 'Upload failed');
    } finally {
      tile.classList.remove('is-uploading');
    }
  }

  async function deleteSelfie(year) {
    const tile = document.querySelector(`.selfie-tile[data-year="${year}"]`);
    if (!tile) return;

    tile.classList.add('is-uploading');

    try {
      const response = await fetch(`/admin/corner/selfie/${year}`, {
        method: 'DELETE'
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Delete failed');
      }

      setTileImage(tile, null);
    } catch (error) {
      console.error('Error deleting selfie:', error);
      alert(error.message || 'Delete failed');
    } finally {
      tile.classList.remove('is-uploading');
    }
  }

  tiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      activeYear = Number(tile.dataset.year);
      fileInput.value = '';
      fileInput.click();
    });

    tile.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activeYear = Number(tile.dataset.year);
        fileInput.value = '';
        fileInput.click();
      }
    });

    const deleteBtn = tile.querySelector('.selfie-tile-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const year = Number(tile.dataset.year);
        deleteSelfie(year);
      });
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || !activeYear) return;
    uploadSelfie(activeYear, file);
    activeYear = null;
  });

  loadSelfies();
});
