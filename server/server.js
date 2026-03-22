// Load environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Import routes
const diaryRoutes = require('./routes/diary');
const adminRoutes = require('./routes/admin');

// Use routes
app.use('/', diaryRoutes);
app.use('/admin', adminRoutes);

// Corner route
app.get('/corner', (req, res) => {
  res.render('trouble-corner', { goals: [] });
});

// Office route
app.get('/office', (req, res) => {
  res.render('office');
});

// API endpoint to get office gallery items
app.get('/api/office-items', (req, res) => {
  const configPath = path.join(__dirname, '../public/images/office/config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const categories = (config.categories || []).map(cat => ({
        ...cat,
        items: (cat.items || []).map(item => ({
          ...item,
          imageUrl: item.url || `/images/office/${item.filename}`,
          title: item.title || '',
          description: item.description || ''
        }))
      }));
      res.json({ success: true, categories });
    } else {
      res.json({ success: true, categories: [] });
    }
  } catch (error) {
    console.error('Error reading office config:', error);
    res.json({ success: true, categories: [] });
  }
});

// API endpoint to get corner images
app.get('/api/corner-images', (req, res) => {
  const configPath = path.join(__dirname, '../public/images/config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const images = config.images.map(img => ({
        url: `/images/${img.filename}`,
        alt: img.alt || 'Memory'
      }));
      res.json({ success: true, images });
    } else {
      res.json({ success: true, images: [] });
    }
  } catch (error) {
    console.error('Error reading corner images config:', error);
    res.json({ success: true, images: [] });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌟 Digital diary server running on http://localhost:${PORT}`);
  console.log(`📝 Admin panel available at http://localhost:${PORT}/admin`);
});

module.exports = app;

