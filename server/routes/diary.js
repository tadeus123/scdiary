const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { 
  getEntries, 
  getBooks, 
  getBookConnections, 
  addBook, 
  addBookConnection, 
  deleteBook 
} = require('../db/supabase');

// Initialize Supabase client for storage
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configure multer for memory storage (Vercel-compatible)
const upload = multer({ 
  storage: multer.memoryStorage(), // Store in memory instead of disk
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

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

// API: Get all books and connections
router.get('/api/books', async (req, res) => {
  try {
    const books = await getBooks();
    const connections = await getBookConnections();
    
    res.json({
      success: true,
      books: books,
      connections: connections
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch books',
      books: [],
      connections: []
    });
  }
});

// API: Add new book
router.post('/api/books', upload.single('cover'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Cover image is required' });
    }
    
    const { title, author, dateRead } = req.body;
    
    if (!title || !author || !dateRead) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    
    // Generate unique filename
    const fileExt = path.extname(req.file.originalname);
    const fileName = `book-${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('book-covers')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      return res.status(500).json({ success: false, error: 'Failed to upload image: ' + uploadError.message });
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('book-covers')
      .getPublicUrl(fileName);
    
    const bookData = {
      title,
      author,
      date_read: dateRead,
      cover_image_url: urlData.publicUrl
    };
    
    const result = await addBook(bookData);
    
    if (result.success) {
      res.json({ success: true, book: result.book });
    } else {
      // If database insert fails, delete the uploaded file
      await supabase.storage.from('book-covers').remove([fileName]);
      res.status(500).json({ success: false, error: result.error || 'Failed to save book' });
    }
  } catch (error) {
    console.error('Error adding book:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Create connection between books
router.post('/api/books/connections', async (req, res) => {
  try {
    const { fromId, toId } = req.body;
    
    if (!fromId || !toId) {
      return res.status(400).json({ success: false, error: 'Both book IDs are required' });
    }
    
    if (fromId === toId) {
      return res.status(400).json({ success: false, error: 'Cannot connect a book to itself' });
    }
    
    const result = await addBookConnection(fromId, toId);
    
    if (result.success) {
      res.json({ success: true, connection: result.connection });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Error creating connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Delete connection
router.delete('/api/books/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete connection from Supabase
    const { error } = await supabase
      .from('book_connections')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting connection:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting connection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Delete book
router.delete('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get book details first to delete the image
    const books = await getBooks();
    const book = books.find(b => b.id === id);
    
    if (!book) {
      return res.status(404).json({ success: false, error: 'Book not found' });
    }
    
    // Delete from database (CASCADE will handle connections)
    const result = await deleteBook(id);
    
    if (result.success) {
      // Delete image from Supabase Storage
      if (book.cover_image_url && book.cover_image_url.includes('supabase')) {
        const fileName = book.cover_image_url.split('/').pop();
        await supabase.storage.from('book-covers').remove([fileName]);
      }
      
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

