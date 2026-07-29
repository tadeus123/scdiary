require('dotenv').config();

const sharp = require('sharp');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TILE_ASPECT = 5 / 6; // width / height
const OUT_MAX_EDGE = 1400;

/**
 * Ask GPT vision for a passport-style crop box that keeps full hair.
 * Returns pixel crop { left, top, width, height } or null.
 */
async function getAiPassportCrop(imageBuffer, imgW, imgH) {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured for selfie crop.');
    return null;
  }

  const preview = await sharp(imageBuffer)
    .rotate()
    .resize({
      width: 1024,
      height: 1024,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  const base64 = preview.toString('base64');

  const prompt = `You are cropping a passport-style portrait photo for a tile (aspect width:height = 5:6).

Return a crop box as JSON fractions of the image (0 to 1):
{"x": <left>, "y": <top>, "width": <w>, "height": <h>}

HARD RULES:
1. Include the COMPLETE hairstyle — from the very top of the hair/crown. Never cut off any hair at the top.
2. Leave a small margin of empty space/background above the hair (about 5-10% of the crop height).
3. Include the full face (forehead, chin, both ears if visible).
4. Include only a LITTLE upper chest / shoulders — passport headshot style, not half-body.
5. Crop aspect ratio MUST be about 5:6 (width/height ≈ 0.833). Prefer expanding downward/sideways rather than cutting the top.
6. Center the head horizontally.
7. Respond with ONLY valid JSON, no markdown.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content:
            'You return precise passport-photo crop boxes as JSON. Never cut off hair. Always keep visible space above the hairline.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: 'high'
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OpenAI vision crop error:', errorData);
    return null;
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse AI crop JSON:', raw);
    return null;
  }

  const x = Number(parsed.x);
  const y = Number(parsed.y);
  const w = Number(parsed.width);
  const h = Number(parsed.height);

  if (![x, y, w, h].every((n) => Number.isFinite(n) && n > 0 && n <= 1.5)) {
    return null;
  }

  // Fractions of the full original image
  let left = x * imgW;
  let top = y * imgH;
  let width = w * imgW;
  let height = h * imgH;

  // Extra safety margin above hair
  const hairSafety = Math.max(height * 0.08, imgH * 0.02);
  top = Math.max(0, top - hairSafety);
  height = Math.min(imgH - top, height + hairSafety);

  return normalizePassportCrop(left, top, width, height, imgW, imgH);
}

/**
 * Force 5:6 crop without cutting the top (protect hair).
 */
function normalizePassportCrop(left, top, width, height, imgW, imgH) {
  left = Math.max(0, left);
  top = Math.max(0, top);
  width = Math.max(1, Math.min(width, imgW - left));
  height = Math.max(1, Math.min(height, imgH - top));

  const targetAspect = TILE_ASPECT;
  let aspect = width / height;

  if (aspect > targetAspect) {
    // Too wide → grow downward; else shrink width from center
    const neededH = width / targetAspect;
    const roomBelow = imgH - top;
    if (neededH <= roomBelow + 0.5) {
      height = neededH;
    } else {
      height = roomBelow;
      const newW = height * targetAspect;
      left += (width - newW) / 2;
      width = newW;
    }
  } else if (aspect < targetAspect) {
    // Too tall → widen from center; else shorten from bottom only
    const neededW = height * targetAspect;
    const cx = left + width / 2;
    if (neededW <= imgW + 0.5) {
      width = neededW;
      left = cx - width / 2;
    } else {
      width = imgW;
      left = 0;
      height = width / targetAspect;
      // keep top fixed (hair safe); height already measured from top
      if (top + height > imgH) {
        height = imgH - top;
      }
    }
  }

  left = Math.max(0, Math.min(left, imgW - 1));
  top = Math.max(0, Math.min(top, imgH - 1));
  width = Math.max(1, Math.min(width, imgW - left));
  height = Math.max(1, Math.min(height, imgH - top));

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function fallbackPassportCrop(imgW, imgH) {
  let height = Math.min(imgH, imgW / TILE_ASPECT) * 0.72;
  let width = height * TILE_ASPECT;
  if (width > imgW) {
    width = imgW;
    height = width / TILE_ASPECT;
  }
  const left = Math.max(0, (imgW - width) / 2);
  const top = Math.max(0, imgH * 0.03);
  return normalizePassportCrop(left, top, width, height, imgW, imgH);
}

/**
 * AI passport crop → JPEG buffer ready for storage.
 */
async function cropSelfieWithAi(inputBuffer) {
  const fullBuffer = await sharp(inputBuffer).rotate().toBuffer();
  const meta = await sharp(fullBuffer).metadata();
  const imgW = meta.width;
  const imgH = meta.height;

  if (!imgW || !imgH) {
    throw new Error('Could not read image dimensions');
  }

  let crop = null;
  try {
    crop = await getAiPassportCrop(fullBuffer, imgW, imgH);
  } catch (error) {
    console.error('AI selfie crop failed:', error);
  }

  if (!crop) {
    console.warn('Using fallback passport crop');
    crop = fallbackPassportCrop(imgW, imgH);
  }

  console.log('Selfie crop:', crop, 'from', imgW, 'x', imgH);

  // Validate extract region
  if (
    crop.left < 0 ||
    crop.top < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.left + crop.width > imgW ||
    crop.top + crop.height > imgH
  ) {
    crop = fallbackPassportCrop(imgW, imgH);
  }

  const outScale = Math.min(1, OUT_MAX_EDGE / Math.max(crop.width, crop.height));
  const finalW = Math.max(1, Math.round(crop.width * outScale));
  const finalH = Math.max(1, Math.round(crop.height * outScale));

  const output = await sharp(fullBuffer)
    .extract({
      left: crop.left,
      top: crop.top,
      width: crop.width,
      height: crop.height
    })
    .resize(finalW, finalH, { fit: 'fill' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  return {
    buffer: output,
    contentType: 'image/jpeg',
    extension: '.jpg',
    crop
  };
}

module.exports = {
  cropSelfieWithAi
};
