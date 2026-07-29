// Admin corner selfie wall — click tile to upload, × to delete
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('selfie-file-input');
  const tiles = Array.from(document.querySelectorAll('.selfie-tile[data-year]'));
  if (!fileInput || !tiles.length) return;

  let activeYear = null;

  // Light client compress only (AI passport crop happens on the server).
  // Vercel serverless body limit is ~4.5MB.
  const MAX_EDGE = 1800;
  const JPEG_QUALITY = 0.88;
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
      // Cache-bust so re-uploads show immediately
      img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
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

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image'));
      };
      img.src = url;
    });
  }

  async function compressForUpload(file) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose an image file');
    }

    const img = await loadImageElement(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    // Already small enough and not huge dimensions — keep original
    if (
      file.size <= MAX_UPLOAD_BYTES &&
      scale === 1 &&
      file.type === 'image/jpeg'
    ) {
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    let quality = JPEG_QUALITY;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

    while (blob && blob.size > MAX_UPLOAD_BYTES && quality > 0.5) {
      quality -= 0.08;
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    }

    if (!blob) {
      throw new Error('Could not compress image');
    }

    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error('Image is still too large after compression. Try a smaller photo.');
    }

    return new File([blob], 'year-selfie.jpg', { type: 'image/jpeg' });
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
      const prepared = await compressForUpload(file);
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
