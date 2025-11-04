const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const entriesPath = path.join(__dirname, '../data/entries.json');

// Admin password (in production, use environment variable)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 
  bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);

// Middleware to check authentication
function isAuthenticated(req, res, next) {
  if (req.session.authenticated) {
    return next();
  }
  res.redirect('/admin');
}

// Helper functions
function getEntries() {
  try {
    const data = fs.readFileSync(entriesPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading entries:', error);
    return [];
  }
}

function saveEntries(entries) {
  try {
    fs.writeFileSync(entriesPath, JSON.stringify(entries, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving entries:', error);
    return false;
  }
}

// Admin login/dashboard page
router.get('/', (req, res) => {
  if (req.session.authenticated) {
    const entries = getEntries();
    // Sort by date, newest first
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.render('admin', { authenticated: true, entries });
  } else {
    res.render('admin', { authenticated: false, error: null, entries: [] });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  const { password } = req.body;
  
  try {
    const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (match) {
      req.session.authenticated = true;
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
router.post('/entry', isAuthenticated, (req, res) => {
  const { content } = req.body;
  
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content is required' });
  }
  
  const entries = getEntries();
  
  const newEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    content: content,
    html: marked(content)
  };
  
  entries.push(newEntry);
  
  if (saveEntries(entries)) {
    res.json({ success: true, entry: newEntry });
  } else {
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

// Delete entry
router.delete('/entry/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  
  const entries = getEntries();
  const filteredEntries = entries.filter(entry => entry.id !== id);
  
  if (filteredEntries.length === entries.length) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  
  if (saveEntries(filteredEntries)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin');
});

module.exports = router;

