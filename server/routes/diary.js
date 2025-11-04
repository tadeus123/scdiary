const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const entriesPath = path.join(__dirname, '../data/entries.json');

// Helper function to read entries
function getEntries() {
  try {
    const data = fs.readFileSync(entriesPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading entries:', error);
    return [];
  }
}

// Main diary page
router.get('/', (req, res) => {
  const entries = getEntries();
  // Sort by date, newest first
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.render('index', { entries });
});

// API endpoint to get entries (for live preview)
router.get('/api/entries', (req, res) => {
  const entries = getEntries();
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(entries);
});

module.exports = router;

