// Face-aware portrait crop for corner selfies (5:6 head + upper body)
(function (global) {
  const TILE_ASPECT = 5 / 6; // width / height
  const MP_VERSION = '0.10.21';
  const MP_MODEL =
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

  let mediaPipeDetectorPromise = null;
  let nativeDetector = null;

  function getNativeDetector() {
    if (nativeDetector !== null) return nativeDetector;
    if (typeof FaceDetector === 'undefined') {
      nativeDetector = false;
      return nativeDetector;
    }
    try {
      nativeDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
    } catch {
      nativeDetector = false;
    }
    return nativeDetector;
  }

  async function getMediaPipeDetector() {
    if (mediaPipeDetectorPromise) return mediaPipeDetectorPromise;

    mediaPipeDetectorPromise = (async () => {
      try {
        const vision = await import(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`
        );
        const fileset = await vision.FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
        );
        return vision.FaceDetector.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MP_MODEL,
            delegate: 'GPU'
          },
          runningMode: 'IMAGE'
        });
      } catch (error) {
        console.warn('MediaPipe face detector unavailable:', error);
        return null;
      }
    })();

    return mediaPipeDetectorPromise;
  }

  function pickBestFace(faces) {
    if (!faces || !faces.length) return null;
    return faces.reduce((best, face) => {
      const area = face.width * face.height;
      const bestArea = best.width * best.height;
      return area > bestArea ? face : best;
    });
  }

  async function detectFaceBox(source) {
    const native = getNativeDetector();
    if (native) {
      try {
        const faces = await native.detect(source);
        const mapped = (faces || [])
          .map((face) => {
            const box = face.boundingBox;
            return {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height
            };
          })
          .filter((box) => box.width > 0 && box.height > 0);
        const best = pickBestFace(mapped);
        if (best) return best;
      } catch (error) {
        console.warn('Native FaceDetector failed:', error);
      }
    }

    const detector = await getMediaPipeDetector();
    if (!detector) return null;

    try {
      const result = detector.detect(source);
      const mapped = (result.detections || [])
        .map((detection) => {
          const box = detection.boundingBox;
          if (!box) return null;
          return {
            x: box.originX,
            y: box.originY,
            width: box.width,
            height: box.height
          };
        })
        .filter(Boolean);
      return pickBestFace(mapped);
    } catch (error) {
      console.warn('MediaPipe face detect failed:', error);
      return null;
    }
  }

  function computePortraitCrop(imgW, imgH, face) {
    let cropH;
    let cropW;
    let centerX;
    let centerY;

    if (face) {
      const faceSize = Math.max(face.width, face.height);
      centerX = face.x + face.width / 2;
      // Bias a bit below face center so shoulders stay in frame
      centerY = face.y + face.height * 0.55;
      // Face ~36% of tile height → consistent head size across tiles
      cropH = faceSize / 0.36;
      cropW = cropH * TILE_ASPECT;
    } else {
      // Fallback: upper-body biased portrait window
      centerX = imgW / 2;
      centerY = imgH * 0.38;
      cropH = Math.min(imgH, imgW / TILE_ASPECT) * 0.92;
      cropW = cropH * TILE_ASPECT;
    }

    const fit = Math.min(1, imgW / cropW, imgH / cropH);
    cropW *= fit;
    cropH *= fit;

    let left = centerX - cropW / 2;
    let top = face
      ? centerY - cropH * 0.42
      : centerY - cropH * 0.45;

    left = Math.max(0, Math.min(left, imgW - cropW));
    top = Math.max(0, Math.min(top, imgH - cropH));

    return {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.max(1, Math.round(cropW)),
      height: Math.max(1, Math.round(cropH))
    };
  }

  async function loadBitmap(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        // fall through
      }
    }

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

  function sourceSize(source) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height
    };
  }

  /**
   * Detect face, crop to head + upper body (5:6), optionally downscale.
   * Returns a JPEG File ready for upload.
   */
  async function cropPortraitSelfie(file, options = {}) {
    const maxEdge = options.maxEdge || 1400;
    const qualityStart = options.quality || 0.84;
    const maxBytes = options.maxBytes || 3.5 * 1024 * 1024;

    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose an image file');
    }

    const source = await loadBitmap(file);
    const { width: imgW, height: imgH } = sourceSize(source);
    if (!imgW || !imgH) {
      throw new Error('Could not read image dimensions');
    }

    // Detect on a moderate-size canvas for speed/compatibility
    const detectMax = 1024;
    const detectScale = Math.min(1, detectMax / Math.max(imgW, imgH));
    const detectW = Math.max(1, Math.round(imgW * detectScale));
    const detectH = Math.max(1, Math.round(imgH * detectScale));
    const detectCanvas = document.createElement('canvas');
    detectCanvas.width = detectW;
    detectCanvas.height = detectH;
    detectCanvas.getContext('2d').drawImage(source, 0, 0, detectW, detectH);

    const faceOnDetect = await detectFaceBox(detectCanvas);
    const face = faceOnDetect
      ? {
          x: faceOnDetect.x / detectScale,
          y: faceOnDetect.y / detectScale,
          width: faceOnDetect.width / detectScale,
          height: faceOnDetect.height / detectScale
        }
      : null;

    const crop = computePortraitCrop(imgW, imgH, face);

    // Output size: keep crop aspect, cap longest edge
    const outScale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
    const outW = Math.max(1, Math.round(crop.width * outScale));
    const outH = Math.max(1, Math.round(crop.height * outScale));

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const ctx = outCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      source,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      outW,
      outH
    );

    if (typeof source.close === 'function') {
      source.close();
    }

    let quality = qualityStart;
    let blob = await new Promise((resolve) => outCanvas.toBlob(resolve, 'image/jpeg', quality));

    while (blob && blob.size > maxBytes && quality > 0.45) {
      quality -= 0.08;
      blob = await new Promise((resolve) => outCanvas.toBlob(resolve, 'image/jpeg', quality));
    }

    if (!blob) {
      throw new Error('Could not process image');
    }

    if (blob.size > maxBytes) {
      throw new Error('Image is still too large after compression. Try a smaller photo.');
    }

    return new File([blob], 'year-selfie.jpg', { type: 'image/jpeg' });
  }

  global.SelfieFaceCrop = {
    cropPortraitSelfie,
    detectFaceBox,
    computePortraitCrop
  };
})(window);
