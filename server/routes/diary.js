const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { 
  getEntries, 
  getBooks, 
  getBookConnections, 
  addBook, 
  addBookConnection, 
  deleteBook 
} = require('../db/supabase');

// Configure multer for book cover uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../public/images/books');
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'book-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
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
    
    const bookData = {
      title,
      author,
      date_read: dateRead,
      cover_image_url: `/images/books/${req.file.filename}`
    };
    
    const result = await addBook(bookData);
    
    if (result.success) {
      res.json({ success: true, book: result.book });
    } else {
      // If database insert fails, delete the uploaded file
      const imagePath = path.join(__dirname, '../../public/images/books', req.file.filename);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
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
      // Delete image file after successful database deletion
      const imagePath = path.join(__dirname, '../../public', book.cover_image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
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

