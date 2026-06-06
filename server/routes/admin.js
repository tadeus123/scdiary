const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { marked } = require('marked');
const {
  getEntries,
  createEntry,
  deleteEntry,
  getEisenkindNotes,
  updateEisenkindNotes,
  isConfigured
} = require('../db/supabase');
const { generateEisenkindStory } = require('../services/eisenkind-story');

// Admin password (in production, use environment variable)
// WARNING: Never hardcode passwords in production!
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
const AUTH_SECRET = process.env.SESSION_SECRET || 'diary-secret-key-change-in-production';

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
    html: marked(content)
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

// Eisenkind notes admin page
router.get('/eisenkind', isAuthenticated, async (req, res) => {
  const notes = await getEisenkindNotes();
  res.render('admin-eisenkind', { notes });
});

router.put('/eisenkind/notes', isAuthenticated, async (req, res) => {
  const { headline, brain_dump } = req.body;

  if (!isConfigured()) {
    return res.status(503).json({
      error:
        'Supabase is not configured on the server. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel environment variables.'
    });
  }

  if (brain_dump !== undefined && typeof brain_dump !== 'string') {
    return res.status(400).json({ error: 'Brain dump must be a string' });
  }
  if (headline !== undefined && typeof headline !== 'string') {
    return res.status(400).json({ error: 'Headline must be a string' });
  }

  const updates = {};
  if (typeof headline === 'string') updates.headline = headline;
  if (typeof brain_dump === 'string') updates.brain_dump = brain_dump;

  const result = await updateEisenkindNotes(updates);

  if (result.success) {
    res.json({ success: true, notes: result.notes });
  } else {
    res.status(500).json({ error: result.error || 'Failed to save notes' });
  }
});

router.post('/eisenkind/generate-story', isAuthenticated, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error:
        'Supabase is not configured on the server. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel environment variables.'
    });
  }

  const notes = await getEisenkindNotes();
  const brainDump =
    typeof req.body?.brain_dump === 'string' ? req.body.brain_dump : notes.brain_dump;

  if (typeof req.body?.brain_dump === 'string') {
    const saveDraft = await updateEisenkindNotes({
      brain_dump: req.body.brain_dump,
      headline: typeof req.body?.headline === 'string' ? req.body.headline : undefined
    });
    if (!saveDraft.success) {
      return res.status(500).json({ error: saveDraft.error || 'Failed to save brain dump' });
    }
  }

  const generated = await generateEisenkindStory({
    brainDump,
    existingStory: notes.story
  });

  if (!generated.success) {
    return res.status(500).json({ error: generated.error || 'Story generation failed' });
  }

  const saved = await updateEisenkindNotes({
    story: generated.story,
    story_updated_at: new Date().toISOString()
  });

  if (!saved.success) {
    return res.status(500).json({ error: saved.error || 'Failed to save story' });
  }

  res.json({ success: true, notes: saved.notes });
});

module.exports = router;
