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

