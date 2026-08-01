// Admin corner selfie wall — manual crop (pan/zoom), then upload
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('selfie-file-input');
  const tiles = Array.from(document.querySelectorAll('.selfie-tile[data-year]'));
  if (!fileInput || !tiles.length) return;

  const modal = document.getElementById('selfie-crop-modal');
  const viewport = document.getElementById('selfie-crop-viewport');
  const cropImage = document.getElementById('selfie-crop-image');
  const yearLabel = document.getElementById('selfie-crop-year');
  const zoomRange = document.getElementById('selfie-crop-zoom');
  const zoomOutBtn = document.getElementById('selfie-crop-zoom-out');
  const zoomInBtn = document.getElementById('selfie-crop-zoom-in');
  const cancelBtn = document.getElementById('selfie-crop-cancel');
  const confirmBtn = document.getElementById('selfie-crop-confirm');

  if (!modal || !viewport || !cropImage || !zoomRange || !cancelBtn || !confirmBtn) return;

  // Tile aspect matches public wall (5:6)
  const TILE_ASPECT = 5 / 6;
  const OUT_MAX_EDGE = 1400;
  const JPEG_QUALITY = 0.9;
  const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  let activeYear = null;
  let objectUrl = null;
  let naturalW = 0;
  let naturalH = 0;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;
  let pointers = new Map();
  let pinchStartDist = 0;
  let pinchStartZoom = 1;

  function setTileImage(tile, url) {
    const year = tile.dataset.year;
    let img = tile.querySelector('img');
    const deleteBtn = tile.querySelector('.selfie-tile-delete');

    if (url) {
      if (!img) {
        img = document.createElement('img');
        img.alt = `Age ${year}`;
        img.decoding = 'async';
        tile.insertBefore(img, tile.firstChild);
      }
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

  function coverBaseScale(vw, vh) {
    return Math.max(vw / naturalW, vh / naturalH);
  }

  function displaySize(vw, vh) {
    const scale = coverBaseScale(vw, vh) * zoom;
    return {
      w: naturalW * scale,
      h: naturalH * scale
    };
  }

  function clampOffsets(vw, vh) {
    const { w, h } = displaySize(vw, vh);
    const minX = vw - w;
    const minY = vh - h;
    offsetX = Math.min(0, Math.max(minX, offsetX));
    offsetY = Math.min(0, Math.max(minY, offsetY));
  }

  function applyTransform() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh || !naturalW || !naturalH) return;

    clampOffsets(vw, vh);
    const { w, h } = displaySize(vw, vh);
    cropImage.style.width = `${w}px`;
    cropImage.style.height = `${h}px`;
    cropImage.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }

  function setZoom(nextZoom, focalX, focalY) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return;

    const prev = zoom;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    zoomRange.value = String(zoom);

    if (prev === zoom) {
      applyTransform();
      return;
    }

    // Keep the point under the finger/cursor stable while zooming
    const fx = focalX == null ? vw / 2 : focalX;
    const fy = focalY == null ? vh / 2 : focalY;
    const imgX = (fx - offsetX) / prev;
    const imgY = (fy - offsetY) / prev;
    offsetX = fx - imgX * zoom;
    offsetY = fy - imgY * zoom;
    applyTransform();
  }

  function centerImage() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const { w, h } = displaySize(vw, vh);
    offsetX = (vw - w) / 2;
    offsetY = (vh - h) / 2;
    applyTransform();
  }

  function openCropper(year, file) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }

    activeYear = year;
    yearLabel.textContent = String(year);
    zoom = 1;
    zoomRange.value = '1';
    pointers.clear();
    dragging = false;

    objectUrl = URL.createObjectURL(file);
    cropImage.onload = () => {
      naturalW = cropImage.naturalWidth;
      naturalH = cropImage.naturalHeight;
      modal.hidden = false;
      document.body.classList.add('selfie-crop-open');
      // Layout after modal is visible
      requestAnimationFrame(() => {
        centerImage();
      });
    };
    cropImage.onerror = () => {
      alert('Could not read image');
      closeCropper();
    };
    cropImage.src = objectUrl;
  }

  function closeCropper() {
    modal.hidden = true;
    document.body.classList.remove('selfie-crop-open');
    cropImage.removeAttribute('src');
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    naturalW = 0;
    naturalH = 0;
    pointers.clear();
    dragging = false;
    activeYear = null;
    fileInput.value = '';
  }

  async function exportCroppedFile() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh || !naturalW || !naturalH) {
      throw new Error('Cropper is not ready');
    }

    const base = coverBaseScale(vw, vh);
    const scale = base * zoom;

    // Source rect in natural image pixels
    const sx = -offsetX / scale;
    const sy = -offsetY / scale;
    const sw = vw / scale;
    const sh = vh / scale;

    const outScale = Math.min(1, OUT_MAX_EDGE / Math.max(sw, sh));
    let outW = Math.max(1, Math.round(sw * outScale));
    let outH = Math.max(1, Math.round(outW / TILE_ASPECT));
    // Keep exact 5:6
    outW = Math.max(1, Math.round(outH * TILE_ASPECT));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cropImage, sx, sy, sw, sh, 0, 0, outW, outH);

    let quality = JPEG_QUALITY;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

    while (blob && blob.size > MAX_UPLOAD_BYTES && quality > 0.55) {
      quality -= 0.08;
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    }

    if (!blob) {
      throw new Error('Could not create cropped image');
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error('Image is still too large after crop. Try a smaller photo.');
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
      const formData = new FormData();
      formData.append('selfie', file);

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

  function pointerDistance() {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  function pointerCenter() {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return { x: 0, y: 0 };
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2
    };
  }

  function localPoint(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  viewport.addEventListener('pointerdown', (event) => {
    if (modal.hidden) return;
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    const pt = localPoint(event.clientX, event.clientY);
    pointers.set(event.pointerId, pt);

    if (pointers.size === 1) {
      dragging = true;
      dragStartX = pt.x;
      dragStartY = pt.y;
      dragOriginX = offsetX;
      dragOriginY = offsetY;
    } else if (pointers.size === 2) {
      dragging = false;
      pinchStartDist = pointerDistance();
      pinchStartZoom = zoom;
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, localPoint(event.clientX, event.clientY));

    if (pointers.size >= 2 && pinchStartDist > 0) {
      const dist = pointerDistance();
      const center = pointerCenter();
      setZoom(pinchStartZoom * (dist / pinchStartDist), center.x, center.y);
      return;
    }

    if (dragging && pointers.size === 1) {
      const pt = pointers.get(event.pointerId);
      offsetX = dragOriginX + (pt.x - dragStartX);
      offsetY = dragOriginY + (pt.y - dragStartY);
      applyTransform();
    }
  });

  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);

    if (pointers.size === 1) {
      const remaining = pointers.values().next().value;
      dragging = true;
      dragStartX = remaining.x;
      dragStartY = remaining.y;
      dragOriginX = offsetX;
      dragOriginY = offsetY;
      pinchStartDist = 0;
    } else if (pointers.size === 0) {
      dragging = false;
      pinchStartDist = 0;
    } else if (pointers.size === 2) {
      pinchStartDist = pointerDistance();
      pinchStartZoom = zoom;
    }
  }

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  viewport.addEventListener(
    'wheel',
    (event) => {
      if (modal.hidden) return;
      event.preventDefault();
      const pt = localPoint(event.clientX, event.clientY);
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      setZoom(zoom * factor, pt.x, pt.y);
    },
    { passive: false }
  );

  zoomRange.addEventListener('input', () => {
    setZoom(Number(zoomRange.value));
  });

  zoomOutBtn.addEventListener('click', () => setZoom(zoom - 0.15));
  zoomInBtn.addEventListener('click', () => setZoom(zoom + 0.15));

  cancelBtn.addEventListener('click', () => {
    closeCropper();
  });

  confirmBtn.addEventListener('click', async () => {
    const year = activeYear;
    if (!year) return;

    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = 'Saving…';

    try {
      const file = await exportCroppedFile();
      closeCropper();
      await uploadSelfie(year, file);
    } catch (error) {
      console.error('Error cropping selfie:', error);
      alert(error.message || 'Could not crop image');
    } finally {
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      confirmBtn.textContent = 'Use photo';
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeCropper();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeCropper();
    }
  });

  window.addEventListener('resize', () => {
    if (!modal.hidden) applyTransform();
  });

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
        deleteSelfie(Number(tile.dataset.year));
      });
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    const year = activeYear;
    if (!file || !year) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file');
      activeYear = null;
      fileInput.value = '';
      return;
    }

    openCropper(year, file);
  });

  loadSelfies();
});
