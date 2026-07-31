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
  getKindHours,
  addKindHours,
  deleteKindHours,
  isConfigured
} = require('../db/supabase');
const { cropSelfieWithAi } = require('../services/selfie-crop');

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
      if (!Number.isInteger(year) || year < 1 || year > 100) {
        return res.status(400).json({ success: false, error: 'Year must be between 1 and 100' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Image is required' });
      }

      const existing = await getCornerSelfie(year);

      let cropped;
      try {
        cropped = await cropSelfieWithAi(req.file.buffer);
      } catch (cropError) {
        console.error('Selfie AI crop error:', cropError);
        return res.status(500).json({ success: false, error: 'Failed to crop image: ' + cropError.message });
      }

      const fileName = `year-${year}-${Date.now()}${cropped.extension}`;

      const { error: uploadError } = await supabase.storage
        .from('corner-selfies')
        .upload(fileName, cropped.buffer, {
          contentType: cropped.contentType,
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
    if (!Number.isInteger(year) || year < 1 || year > 100) {
      return res.status(400).json({ success: false, error: 'Year must be between 1 and 100' });
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
  const kindHours = await getKindHours();
  res.render('admin-eisenkind', { notes, kindHours });
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

router.post('/eisenkind/hours', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Supabase is not configured on the server.'
    });
  }

  const hours = Number(req.body.hours);
  const dateLogged = req.body.dateLogged || req.body.date_logged;

  if (!Number.isFinite(hours) || hours <= 0) {
    return res.status(400).json({ success: false, error: 'Hours must be a positive number' });
  }

  if (!dateLogged || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateLogged))) {
    return res.status(400).json({ success: false, error: 'Please select a valid date' });
  }

  const result = await addKindHours(hours, dateLogged);
  if (result.success) {
    res.json({ success: true, entry: result.entry });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to add hours' });
  }
});

router.delete('/eisenkind/hours/:id', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Supabase is not configured on the server.'
    });
  }

  const result = await deleteKindHours(req.params.id);
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to delete entry' });
  }
});

module.exports = router;
