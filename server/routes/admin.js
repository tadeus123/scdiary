const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { renderDiaryHtml } = require('../utils/diary-markdown');
const {
  getEntries,
  createEntry,
  deleteEntry,
  getEisenkindNotes,
  updateEisenkindNotes,
  getCornerSelfie,
  upsertCornerSelfie,
  deleteCornerSelfie,
  getLiquiditySettings,
  upsertLiquiditySettings,
  getLiquidityEntries,
  createLiquidityEntry,
  deleteLiquidityEntry,
  getLiquidityRecurring,
  createLiquidityRecurring,
  deleteLiquidityRecurring,
  isConfigured
} = require('../db/supabase');
const { getEurUsdRate } = require('../utils/fx');
const {
  parsePositiveAmount,
  normalizeCurrency,
  normalizeDirection,
  signedUsd,
  roundMoney,
  toNumber
} = require('../utils/liquidity');
// Admin password (in production, use environment variable)
// WARNING: Never hardcode passwords in production!
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
const AUTH_SECRET = process.env.SESSION_SECRET || 'diary-secret-key-change-in-production';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const selfieUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

function storagePathFromPublicUrl(url, bucket) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
}

if (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD) {
  console.error('⚠️  WARNING: ADMIN_PASSWORD or ADMIN_PASSWORD_HASH must be set in environment variables!');
}

// Generate secure auth token
function generateAuthToken() {
  return crypto.createHmac('sha256', AUTH_SECRET)
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex');
}

// Verify auth token
function verifyAuthToken(token) {
  if (!token) return false;
  // Token should be 64 char hex string from HMAC SHA256
  return token.length === 64 && /^[a-f0-9]+$/.test(token);
}

// Middleware to check authentication via cookie
function isAuthenticated(req, res, next) {
  const authToken = req.cookies.diary_auth;
  if (authToken && verifyAuthToken(authToken)) {
    return next();
  }
  res.redirect('/admin');
}

// Admin login/dashboard page
router.get('/', async (req, res) => {
  const authToken = req.cookies.diary_auth;
  
  if (authToken && verifyAuthToken(authToken)) {
    const entries = await getEntries();
    res.render('admin', { authenticated: true, entries });
  } else {
    res.render('admin', { authenticated: false, error: null, entries: [] });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  const { password } = req.body;
  
  let match = false;
  
  try {
    // Try ADMIN_PASSWORD_HASH first if it exists
    if (ADMIN_PASSWORD_HASH) {
      match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    }
    
    // If no match and ADMIN_PASSWORD is set, try comparing directly
    if (!match && ADMIN_PASSWORD) {
      match = (password === ADMIN_PASSWORD);
    }
    
    if (match) {
      const authToken = generateAuthToken();
      res.cookie('diary_auth', authToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
      });
      res.redirect('/admin');
    } else {
      res.render('admin', { authenticated: false, error: 'Invalid password', entries: [] });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('admin', { authenticated: false, error: 'Login error', entries: [] });
  }
});

// Save new entry
router.post('/entry', isAuthenticated, async (req, res) => {
  const { content, timestamp } = req.body;
  
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content is required' });
  }
  
  const newEntry = {
    id: Date.now().toString(),
    timestamp: timestamp || new Date().toISOString(), // Use client timestamp if provided
    content: content,
    html: renderDiaryHtml(content)
  };
  
  const result = await createEntry(newEntry);
  
  if (result.success) {
    res.json({ success: true, entry: result.entry });
  } else {
    res.status(500).json({ error: result.error || 'Failed to save entry' });
  }
});

// Delete entry
router.delete('/entry/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  
  const result = await deleteEntry(id);
  
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: result.error || 'Entry not found' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('diary_auth');
  res.redirect('/admin');
});

// Bookshelf admin page
router.get('/bookshelf', isAuthenticated, (req, res) => {
  res.render('admin-bookshelf');
});

// Company Education admin page
router.get('/ce', isAuthenticated, (req, res) => {
  res.render('admin-ce');
});

// Corner selfie wall admin page
router.get('/corner', isAuthenticated, (req, res) => {
  res.render('admin-corner');
});

router.post('/corner/selfie/:year', isAuthenticated, (req, res) => {
  selfieUpload.single('selfie')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
    }

    try {
      if (!supabase || !isConfigured()) {
        return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
      }

      const year = parseInt(req.params.year, 10);
      if (!Number.isInteger(year) || year < 0 || year > 99) {
        return res.status(400).json({ success: false, error: 'Year must be between 0 and 99' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Image is required' });
      }

      const existing = await getCornerSelfie(year);

      // Client already cropped to the tile frame; store as uploaded.
      const contentType = req.file.mimetype || 'image/jpeg';
      const extension = contentType.includes('png')
        ? '.png'
        : contentType.includes('webp')
          ? '.webp'
          : contentType.includes('gif')
            ? '.gif'
            : '.jpg';
      const fileName = `year-${year}-${Date.now()}${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('corner-selfies')
        .upload(fileName, req.file.buffer, {
          contentType,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Corner selfie upload error:', uploadError);
        return res.status(500).json({ success: false, error: 'Failed to upload image: ' + uploadError.message });
      }

      const { data: urlData } = supabase.storage
        .from('corner-selfies')
        .getPublicUrl(fileName);

      const result = await upsertCornerSelfie(year, urlData.publicUrl);
      if (!result.success) {
        await supabase.storage.from('corner-selfies').remove([fileName]);
        return res.status(500).json({ success: false, error: result.error || 'Failed to save selfie' });
      }

      if (existing && existing.image_url) {
        const oldPath = storagePathFromPublicUrl(existing.image_url, 'corner-selfies');
        if (oldPath) {
          await supabase.storage.from('corner-selfies').remove([oldPath]);
        }
      }

      res.json({ success: true, selfie: result.selfie });
    } catch (error) {
      console.error('Error uploading corner selfie:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to upload selfie' });
    }
  });
});

router.delete('/corner/selfie/:year', isAuthenticated, async (req, res) => {
  try {
    if (!supabase || !isConfigured()) {
      return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
    }

    const year = parseInt(req.params.year, 10);
    if (!Number.isInteger(year) || year < 0 || year > 99) {
      return res.status(400).json({ success: false, error: 'Year must be between 0 and 99' });
    }

    const result = await deleteCornerSelfie(year);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Failed to delete selfie' });
    }

    if (result.selfie && result.selfie.image_url) {
      const oldPath = storagePathFromPublicUrl(result.selfie.image_url, 'corner-selfies');
      if (oldPath) {
        await supabase.storage.from('corner-selfies').remove([oldPath]);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting corner selfie:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete selfie' });
  }
});

// Eisenkind notes admin page
router.get('/eisenkind', isAuthenticated, async (req, res) => {
  const notes = await getEisenkindNotes();
  res.render('admin-eisenkind', { notes });
});

function newLiquidityId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function parseStartingDate(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T00:00:00.000Z`;
}

router.get('/liquidity', isAuthenticated, async (req, res) => {
  const [settings, entries, recurring] = await Promise.all([
    getLiquiditySettings(),
    getLiquidityEntries(),
    getLiquidityRecurring()
  ]);
  res.render('admin-liquidity', { settings, entries, recurring });
});

router.put('/liquidity/settings', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const starting = Number(String(req.body?.starting_balance_usd ?? '').replace(',', '.'));
  const starting_at = parseStartingDate(req.body?.starting_at);

  if (!Number.isFinite(starting)) {
    return res.status(400).json({ success: false, error: 'Starting balance must be a number in USD.' });
  }
  if (!starting_at) {
    return res.status(400).json({ success: false, error: 'Starting date is required.' });
  }

  const result = await upsertLiquiditySettings({
    starting_balance_usd: roundMoney(starting),
    starting_at
  });

  if (result.success) {
    res.json({ success: true, settings: result.settings });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to save starting point' });
  }
});

router.post('/liquidity/entry', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const amount = parsePositiveAmount(req.body?.amount);
  const currency = normalizeCurrency(req.body?.currency);
  const direction = normalizeDirection(req.body?.direction);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const timestamp = req.body?.timestamp || new Date().toISOString();

  if (!amount) {
    return res.status(400).json({ success: false, error: 'Amount must be greater than 0.' });
  }
  if (!currency) {
    return res.status(400).json({ success: false, error: 'Currency must be USD or EUR.' });
  }
  if (!direction) {
    return res.status(400).json({ success: false, error: 'Choose in or out.' });
  }

  let fx_rate = 1;
  try {
    if (currency === 'EUR') {
      fx_rate = await getEurUsdRate(timestamp);
    }
  } catch (error) {
    console.error('FX conversion failed:', error);
    return res.status(502).json({ success: false, error: 'Could not convert EUR to USD. Try again, or log in USD.' });
  }

  const entry = {
    id: newLiquidityId('lq'),
    timestamp,
    amount,
    currency,
    fx_rate,
    amount_usd: signedUsd(amount, direction, fx_rate),
    direction,
    note
  };

  const result = await createLiquidityEntry(entry);
  if (result.success) {
    res.json({ success: true, entry: result.entry });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to save entry' });
  }
});

router.delete('/liquidity/entry/:id', isAuthenticated, async (req, res) => {
  const result = await deleteLiquidityEntry(req.params.id);
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to delete entry' });
  }
});

router.post('/liquidity/recurring', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const amount = parsePositiveAmount(req.body?.amount);
  const currency = normalizeCurrency(req.body?.currency);
  const direction = normalizeDirection(req.body?.direction);
  const day = Math.round(toNumber(req.body?.day_of_month, 0));
  const start_date = String(req.body?.start_date || '').slice(0, 10);

  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required.' });
  }
  if (!amount) {
    return res.status(400).json({ success: false, error: 'Amount must be greater than 0.' });
  }
  if (!currency) {
    return res.status(400).json({ success: false, error: 'Currency must be USD or EUR.' });
  }
  if (!direction) {
    return res.status(400).json({ success: false, error: 'Choose in or out.' });
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return res.status(400).json({ success: false, error: 'Day of month must be between 1 and 31.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
    return res.status(400).json({ success: false, error: 'Start date is required.' });
  }

  const item = {
    id: newLiquidityId('lm'),
    name,
    amount,
    currency,
    direction,
    day_of_month: day,
    start_date,
    end_date: null
  };

  const result = await createLiquidityRecurring(item);
  if (result.success) {
    res.json({ success: true, item: result.item });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to save monthly payment' });
  }
});

router.delete('/liquidity/recurring/:id', isAuthenticated, async (req, res) => {
  const result = await deleteLiquidityRecurring(req.params.id);
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to delete monthly payment' });
  }
});

router.put('/eisenkind/notes', isAuthenticated, async (req, res) => {
  const { story } = req.body;

  if (!isConfigured()) {
    return res.status(503).json({
      error:
        'Supabase is not configured on the server. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel environment variables.'
    });
  }

  if (story !== undefined && typeof story !== 'string') {
    return res.status(400).json({ error: 'Story must be a string' });
  }

  const updates = {};
  if (typeof story === 'string') {
    updates.story = story;
    updates.story_updated_at = new Date().toISOString();
  }

  const result = await updateEisenkindNotes(updates);

  if (result.success) {
    res.json({ success: true, notes: result.notes });
  } else {
    res.status(500).json({ error: result.error || 'Failed to save story' });
  }
});

module.exports = router;
