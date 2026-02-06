const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { marked } = require('marked');
const { getEntries, createEntry, deleteEntry, getBooks } = require('../db/supabase');

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

// Convert @mentions to bookshelf links
async function processBookMentions(content) {
  try {
    const books = await getBooks();
    let processedContent = content;
    
    // If no books or books array is empty, return content unchanged
    if (!books || books.length === 0) {
      return processedContent;
    }
    
    // Create a map of book titles to IDs for quick lookup
    const bookMap = new Map();
    books.forEach(book => {
      if (book && book.title && book.id) {
        bookMap.set(book.title.toLowerCase(), book.id);
      }
    });
    
    // Match @[Book Title] pattern (with brackets for exact matches)
    const bracketPattern = /@\[([^\]]+)\]/g;
    processedContent = processedContent.replace(bracketPattern, (match, title) => {
      const bookId = bookMap.get(title.toLowerCase());
      if (bookId) {
        return `[@${title}](/bookshelf?book=${bookId})`;
      }
      // If book not found, leave the @[Book Title] as-is (will render as plain text)
      return match;
    });
    
    return processedContent;
  } catch (error) {
    // If book fetching fails, log error but don't break entry creation
    console.error('Error processing book mentions:', error);
    // Return original content so entry can still be saved
    return content;
  }
}

// Save new entry
router.post('/entry', isAuthenticated, async (req, res) => {
  const { content, timestamp } = req.body;
  
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content is required' });
  }
  
  // Process @mentions before converting to markdown
  const processedContent = await processBookMentions(content);
  
  const newEntry = {
    id: Date.now().toString(),
    timestamp: timestamp || new Date().toISOString(), // Use client timestamp if provided
    content: content,
    html: marked(processedContent)
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

// API: Get books for autocomplete (search by title)
router.get('/api/books-search', isAuthenticated, async (req, res) => {
  try {
    const { q } = req.query;
    const { getBooks } = require('../db/supabase');
    const books = await getBooks();
    
    // Handle case where books is null, undefined, or not an array
    if (!books || !Array.isArray(books)) {
      return res.json({ success: true, books: [] });
    }
    
    if (q && q.trim()) {
      const query = q.toLowerCase();
      // Filter with safety checks
      const filtered = books.filter(book => 
        book && 
        book.title && 
        book.author &&
        (book.title.toLowerCase().includes(query) || 
         book.author.toLowerCase().includes(query))
      );
      res.json({ success: true, books: filtered });
    } else {
      res.json({ success: true, books: books });
    }
  } catch (error) {
    console.error('Error searching books:', error);
    res.status(500).json({ success: false, error: error.message, books: [] });
  }
});

module.exports = router;
