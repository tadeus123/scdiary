const express = require('express');
const router = express.Router();
const { getEntries } = require('../db/supabase');

// Main diary page
router.get('/', async (req, res) => {
  const entries = await getEntries();
  // Entries are already sorted by timestamp DESC from database
  res.render('index', { entries });
});

// API endpoint to get entries (for live preview)
router.get('/api/entries', async (req, res) => {
  const entries = await getEntries();
  res.json(entries);
});

// Bookshelf page
router.get('/bookshelf', (req, res) => {
  res.render('bookshelf');
});

module.exports = router;

