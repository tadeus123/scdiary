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
  createLiquidityEntry,
  updateLiquidityEntry,
  deleteLiquidityEntry,
  createLiquidityRecurring,
  deleteLiquidityRecurring,
  getLiquidityLiability,
  createLiquidityLiability,
  updateLiquidityLiability,
  deleteLiquidityLiability,
  upsertLiquiditySettings,
  getPeopleGraph,
  createPeopleGraphNode,
  updatePeopleGraphNode,
  deletePeopleGraphNode,
  setPeopleGraphParent,
  isConfigured
} = require('../db/supabase');
const { getLatestEurUsdRate } = require('../utils/fx');
const {
  parsePositiveAmount,
  parseSignedAmount,
  normalizeCurrency,
  normalizeStatus,
  normalizeAccount,
  signedUsd,
  roundMoney,
  toNumber,
  parseDayInput,
  berlinDateKey,
  berlinNoonIso
} = require('../utils/liquidity');
const { loadLiquidityGraph, materializeDueMonthlyLogs } = require('../utils/liquidity-graph');
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

function readLiabilityFields(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const amount = parsePositiveAmount(body?.amount);
  const currency = normalizeCurrency(body?.currency);
  const createdKey = parseDayInput(body?.date || body?.created_at, berlinDateKey());
  if (!name) return { error: 'What is this liability?' };
  if (!amount) return { error: 'Amount must be a number other than 0, like -25.32.' };
  if (!currency) return { error: 'Currency must be USD or EUR.' };
  if (!createdKey) return { error: 'Date is required.' };
  return { name, amount, currency, createdKey };
}

async function snapshotFxRate(currency) {
  if (currency !== 'USD') return 1;
  return getLatestEurUsdRate();
}

async function markLiabilityPaid(liability, payment) {
  return updateLiquidityLiability(liability.id, {
    status: 'paid',
    paid_at: payment.timestamp,
    payment_entry_id: payment.id,
    entry_id: null
  });
}

function timestampFromBody(body, fallbackKey = berlinDateKey()) {
  if (typeof body?.timestamp === 'string' && body.timestamp.trim()) {
    const parsed = new Date(body.timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const key = parseDayInput(body?.date, fallbackKey);
  return berlinNoonIso(key);
}

router.get('/liquidity', isAuthenticated, async (req, res) => {
  const graph = await loadLiquidityGraph();
  res.render('admin-liquidity', graph);
});

router.put('/liquidity/settings', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const graph = await loadLiquidityGraph();
  const nextCash = parseSignedAmount(req.body?.cash_eur);
  const nextBank = parseSignedAmount(req.body?.bank_eur);
  const dateKey = parseDayInput(req.body?.date, berlinDateKey());
  const timestamp = berlinNoonIso(dateKey);
  const updates = { ...graph.settings };

  if (req.body?.cash_eur !== undefined && req.body?.cash_eur !== '') {
    const cashValue = nextCash
      ? (nextCash.direction === 'out' ? -nextCash.amount : nextCash.amount)
      : Number(req.body.cash_eur);
    if (!Number.isFinite(Number(cashValue))) {
      return res.status(400).json({ success: false, error: 'Cash must be a number.' });
    }
    const target = roundMoney(cashValue);
    const diff = roundMoney(target - graph.series.cash);
    if (diff !== 0) {
      const logged = await createLiquidityEntry({
        id: newLiquidityId('lq'),
        timestamp,
        amount: Math.abs(diff),
        currency: 'EUR',
        fx_rate: 1,
        amount_usd: signedUsd(Math.abs(diff), diff < 0 ? 'out' : 'in', 1),
        direction: diff < 0 ? 'out' : 'in',
        note: 'cash',
        status: 'approved',
        account: 'cash',
        liability_id: null
      });
      if (!logged.success) {
        return res.status(500).json({ success: false, error: logged.error || 'Failed to update cash' });
      }
    }
    updates.cash_eur = target;
  }

  if (req.body?.bank_eur !== undefined && req.body?.bank_eur !== '') {
    const bankValue = nextBank
      ? (nextBank.direction === 'out' ? -nextBank.amount : nextBank.amount)
      : Number(req.body.bank_eur);
    if (!Number.isFinite(Number(bankValue))) {
      return res.status(400).json({ success: false, error: 'Bank account must be a number.' });
    }
    const target = roundMoney(bankValue);
    const diff = roundMoney(target - graph.series.bank);
    if (diff !== 0) {
      const logged = await createLiquidityEntry({
        id: newLiquidityId('lq'),
        timestamp,
        amount: Math.abs(diff),
        currency: 'EUR',
        fx_rate: 1,
        amount_usd: signedUsd(Math.abs(diff), diff < 0 ? 'out' : 'in', 1),
        direction: diff < 0 ? 'out' : 'in',
        note: 'bank account',
        status: 'approved',
        account: 'bank',
        liability_id: null
      });
      if (!logged.success) {
        return res.status(500).json({ success: false, error: logged.error || 'Failed to update bank account' });
      }
    }
  }

  const result = await upsertLiquiditySettings(updates);
  if (result.success) {
    res.json({ success: true, settings: result.settings });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to save' });
  }
});

router.post('/liquidity/liability', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const fields = readLiabilityFields(req.body);
  if (fields.error) {
    return res.status(400).json({ success: false, error: fields.error });
  }

  const { name, amount, currency, createdKey } = fields;
  let fx_rate = 1;
  try {
    fx_rate = await snapshotFxRate(currency);
  } catch (error) {
    console.error('FX conversion failed:', error);
    return res.status(502).json({ success: false, error: 'Could not convert USD to EUR. Try again, or log in EUR.' });
  }

  const item = {
    id: newLiquidityId('lb'),
    name,
    amount,
    currency,
    fx_rate,
    amount_usd: roundMoney(amount * fx_rate),
    due_date: null,
    created_at: berlinNoonIso(createdKey),
    status: 'open',
    paid_at: null,
    payment_entry_id: null,
    entry_id: null
  };

  const result = await createLiquidityLiability(item);
  if (result.success) {
    res.json({ success: true, item: result.item });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to save liability' });
  }
});

router.put('/liquidity/liability/:id', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const liability = await getLiquidityLiability(req.params.id);
  if (!liability) {
    return res.status(404).json({ success: false, error: 'Liability not found' });
  }

  const fields = readLiabilityFields(req.body);
  if (fields.error) {
    return res.status(400).json({ success: false, error: fields.error });
  }

  const { name, amount, currency, createdKey } = fields;
  let fx_rate = 1;
  try {
    fx_rate = await snapshotFxRate(currency);
  } catch (error) {
    console.error('FX conversion failed:', error);
    return res.status(502).json({ success: false, error: 'Could not convert USD to EUR. Try again, or log in EUR.' });
  }

  const result = await updateLiquidityLiability(liability.id, {
    name,
    amount,
    currency,
    fx_rate,
    amount_usd: roundMoney(amount * fx_rate),
    created_at: berlinNoonIso(createdKey)
  });
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error || 'Failed to save liability' });
  }

  res.json({ success: true, item: result.item });
});

router.post('/liquidity/liability/:id/paid', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const liability = await getLiquidityLiability(req.params.id);
  if (!liability) {
    return res.status(404).json({ success: false, error: 'Liability not found' });
  }
  if (String(liability.status || 'open') === 'paid') {
    return res.json({ success: true, item: liability });
  }

  let fx_rate = toNumber(liability.fx_rate, 1);
  try {
    fx_rate = await snapshotFxRate(liability.currency);
  } catch (error) {
    console.error('FX conversion failed:', error);
    return res.status(502).json({ success: false, error: 'Could not convert USD to EUR. Try again, or log in EUR.' });
  }

  const account = normalizeAccount(req.body?.account) || 'bank';
  const payment = {
    id: newLiquidityId('lq'),
    timestamp: timestampFromBody(req.body),
    amount: toNumber(liability.amount),
    currency: liability.currency,
    fx_rate,
    amount_usd: signedUsd(liability.amount, 'out', fx_rate),
    direction: 'out',
    note: liability.name || '',
    status: 'approved',
    account,
    liability_id: liability.id
  };

  const logged = await createLiquidityEntry(payment);
  if (!logged.success) {
    return res.status(500).json({ success: false, error: logged.error || 'Failed to log payment' });
  }

  const result = await markLiabilityPaid(liability, logged.entry || payment);
  if (!result.success) {
    await deleteLiquidityEntry(payment.id);
    return res.status(500).json({ success: false, error: result.error || 'Failed to mark as paid' });
  }

  res.json({ success: true, item: result.item, entry: logged.entry });
});

router.delete('/liquidity/liability/:id', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const liability = await getLiquidityLiability(req.params.id);
  if (!liability) {
    return res.status(404).json({ success: false, error: 'Liability not found' });
  }

  const result = await deleteLiquidityLiability(liability.id);
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to delete liability' });
  }
});

router.post('/liquidity/entry', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const signed = parseSignedAmount(req.body?.amount);
  const currency = normalizeCurrency(req.body?.currency);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const status = normalizeStatus(req.body?.status) || 'approved';
  const account = normalizeAccount(req.body?.account) || 'bank';
  const liabilityId = typeof req.body?.liability_id === 'string' ? req.body.liability_id.trim() : '';

  if (!signed) {
    return res.status(400).json({ success: false, error: 'Amount must be a number other than 0, like -25.32 or 25.32.' });
  }
  if (!currency) {
    return res.status(400).json({ success: false, error: 'Currency must be USD or EUR.' });
  }
  const { amount, direction } = signed;

  let fx_rate = 1;
  try {
    fx_rate = await snapshotFxRate(currency);
  } catch (error) {
    console.error('FX conversion failed:', error);
    return res.status(502).json({ success: false, error: 'Could not convert USD to EUR. Try again, or log in EUR.' });
  }

  const entry = {
    id: newLiquidityId('lq'),
    timestamp: timestampFromBody(req.body),
    amount,
    currency,
    fx_rate,
    amount_usd: signedUsd(amount, direction, fx_rate),
    direction,
    note,
    status,
    account,
    liability_id: liabilityId || null
  };

  const result = await createLiquidityEntry(entry);
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error || 'Failed to save entry' });
  }

  if (status === 'approved' && liabilityId) {
    const liability = await getLiquidityLiability(liabilityId);
    if (liability && String(liability.status || 'open') !== 'paid') {
      await markLiabilityPaid(liability, result.entry || entry);
    }
  }

  res.json({ success: true, entry: result.entry });
});

router.post('/liquidity/entry/:id/approve', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured on the server.' });
  }

  const fields = {
    status: 'approved'
  };
  if (req.body?.date || req.body?.timestamp) {
    fields.timestamp = timestampFromBody(req.body);
  }

  const result = await updateLiquidityEntry(req.params.id, fields);
  if (!result.success || !result.entry) {
    return res.status(500).json({ success: false, error: result.error || 'Failed to approve' });
  }

  if (result.entry.liability_id) {
    const liability = await getLiquidityLiability(result.entry.liability_id);
    if (liability && String(liability.status || 'open') !== 'paid') {
      await markLiabilityPaid(liability, result.entry);
    }
  }

  res.json({ success: true, entry: result.entry });
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
  const signed = parseSignedAmount(req.body?.amount);
  const currency = normalizeCurrency(req.body?.currency);
  const day = Math.round(toNumber(req.body?.day_of_month, 0));
  const start_date = parseDayInput(req.body?.start_date, berlinDateKey());

  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required.' });
  }
  if (!signed) {
    return res.status(400).json({ success: false, error: 'Amount must be a number other than 0, like -25.32 or 25.32.' });
  }
  if (!currency) {
    return res.status(400).json({ success: false, error: 'Currency must be USD or EUR.' });
  }
  const { amount, direction } = signed;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return res.status(400).json({ success: false, error: 'Day of month must be between 1 and 31.' });
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
    await materializeDueMonthlyLogs();
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

function peoplePhotoUpload(req, res, next) {
  selfieUpload.single('photo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
    }
    next();
  });
}

async function uploadPeoplePhoto(file) {
  const fileExt = path.extname(file.originalname || '') || '.jpg';
  const fileName = `people-${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from('people-photos')
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false
    });
  if (uploadError) {
    throw new Error(uploadError.message);
  }
  const { data: urlData } = supabase.storage
    .from('people-photos')
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}

async function removePeoplePhoto(url) {
  const oldPath = storagePathFromPublicUrl(url, 'people-photos');
  if (!oldPath) return;
  await supabase.storage.from('people-photos').remove([oldPath]);
}

router.get('/graph', isAuthenticated, (req, res) => {
  res.render('admin-graph');
});

router.post('/graph/node', isAuthenticated, peoplePhotoUpload, async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const nameZh = typeof req.body?.name_zh === 'string' ? req.body.name_zh.trim() : '';
    const descriptionZh = typeof req.body?.description_zh === 'string' ? req.body.description_zh.trim() : '';
    const fromId = typeof req.body?.from_id === 'string' ? req.body.from_id.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    let photo_url = null;
    if (req.file) {
      try {
        photo_url = await uploadPeoplePhoto(req.file);
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to upload image: ' + error.message });
      }
    }

    const result = await createPeopleGraphNode({
      name,
      description,
      name_zh: nameZh,
      description_zh: descriptionZh,
      photo_url
    });
    if (!result.success) {
      if (photo_url) await removePeoplePhoto(photo_url);
      return res.status(500).json(result);
    }

    if (fromId) {
      const edge = await setPeopleGraphParent(result.node.id, fromId);
      if (!edge.success) {
        return res.status(500).json({ success: false, error: edge.error, node: result.node });
      }
    }

    res.json({ success: true, node: result.node });
  } catch (error) {
    console.error('Error creating people graph node:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add person' });
  }
});

router.put('/graph/node/:id', isAuthenticated, peoplePhotoUpload, async (req, res) => {
  try {
    const id = req.params.id;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const nameZh = typeof req.body?.name_zh === 'string' ? req.body.name_zh.trim() : '';
    const descriptionZh = typeof req.body?.description_zh === 'string' ? req.body.description_zh.trim() : '';
    const fromIdRaw = req.body?.from_id;
    const fromId = typeof fromIdRaw === 'string' ? fromIdRaw.trim() : '';

    const updates = {};
    if (name) updates.name = name;
    if (typeof req.body?.description === 'string') updates.description = description;
    if (typeof req.body?.name_zh === 'string') updates.name_zh = nameZh;
    if (typeof req.body?.description_zh === 'string') updates.description_zh = descriptionZh;

    if (req.file) {
      try {
        updates.photo_url = await uploadPeoplePhoto(req.file);
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to upload image: ' + error.message });
      }
    }

    const existing = (await getPeopleGraph()).nodes.find((n) => n.id === id);
    const result = Object.keys(updates).length
      ? await updatePeopleGraphNode(id, updates)
      : { success: true, node: existing };
    if (!result.success) {
      if (updates.photo_url) await removePeoplePhoto(updates.photo_url);
      return res.status(500).json(result);
    }

    if (updates.photo_url && existing?.photo_url) {
      await removePeoplePhoto(existing.photo_url);
    }

    if (typeof fromIdRaw === 'string') {
      const edge = await setPeopleGraphParent(id, fromId || null);
      if (!edge.success) {
        return res.status(500).json({ success: false, error: edge.error, node: result.node });
      }
    }

    res.json({ success: true, node: result.node });
  } catch (error) {
    console.error('Error updating people graph node:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update person' });
  }
});

router.delete('/graph/node/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await deletePeopleGraphNode(req.params.id);
    if (!result.success) {
      return res.status(500).json(result);
    }
    if (result.node?.photo_url) {
      await removePeoplePhoto(result.node.photo_url);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting people graph node:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete person' });
  }
});

module.exports = router;
