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

// Trouble corner route
app.get('/trouble-corner', (req, res) => {
  res.render('trouble-corner');
});

// Start server
app.listen(PORT, () => {
  console.log(`🌟 Digital diary server running on http://localhost:${PORT}`);
  console.log(`📝 Admin panel available at http://localhost:${PORT}/admin`);
});

module.exports = app;

