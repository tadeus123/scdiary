// Load environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const { getSeoForPath, getCanonicalUrl, getPersonSchema, buildSitemapXml, SITE_URL, FAVICON_VERSION } = require('./utils/seo');

const app = express();
const PORT = process.env.PORT || 3000;

app.locals.getCanonicalUrl = getCanonicalUrl;
app.locals.getPersonSchema = getPersonSchema;
app.locals.SITE_URL = SITE_URL;
app.locals.FAVICON_VERSION = FAVICON_VERSION;
app.use((req, res, next) => {
  res.locals.seo = getSeoForPath(req.path);
  next();
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const publicDir = path.join(__dirname, '../public');
const faviconRoutes = [
  ['/favicon.ico', 'favicon-32.png', 'image/png'],
  ['/favicon-16.png', 'favicon-16.png', 'image/png'],
  ['/favicon-32.png', 'favicon-32.png', 'image/png'],
  ['/favicon-48.png', 'favicon-48.png', 'image/png'],
  ['/apple-touch-icon.png', 'apple-touch-icon.png', 'image/png']
];
for (const [route, fileName, mimeType] of faviconRoutes) {
  app.get(route, (req, res) => {
    res.type(mimeType);
    res.set('Cache-Control', 'public, max-age=604800');
    res.sendFile(path.join(publicDir, fileName));
  });
}

app.use(express.static(publicDir));

// Eisenkind static site at /eisenkind
const eisenkindDir = path.join(__dirname, '../eisenkind');
app.get(['/eisenkind', '/eisenkind/'], (req, res) => {
  res.sendFile(path.join(eisenkindDir, 'index.html'));
});
app.use('/eisenkind', express.static(eisenkindDir));
app.get(['/tademehl/eisenkind', '/tademehl/eisenkind/'], (req, res) => {
  res.redirect(301, '/eisenkind');
});

// Cause effect map (Vite/React SPA) at /cause
const causeDir = path.join(__dirname, '../cause/dist');
const causeIndex = path.join(causeDir, 'index.html');
if (!fs.existsSync(causeIndex)) {
  console.warn('Cause app not built — run: npm run build:cause');
}
const sendCauseIndex = (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(causeIndex);
};
app.get(['/cause', '/cause/'], sendCauseIndex);
app.use('/cause', express.static(causeDir, { index: false }));
app.get('/cause/*', (req, res, next) => {
  // Missing hashed assets must 404 — returning index.html breaks JS module loading.
  if (/\.[a-z0-9]+$/i.test(req.path)) {
    return res.status(404).send('Not found');
  }
  sendCauseIndex(req, res);
});
app.get(['/tademehl/cause', '/tademehl/cause/'], (req, res) => {
  res.redirect(301, '/cause');
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Import routes
const diaryRoutes = require('./routes/diary');
const adminRoutes = require('./routes/admin');

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.send(buildSitemapXml());
});

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

// Eisenkind story (public read)
const { getEisenkindNotes, getCauseGraph, saveCauseGraph } = require('./db/supabase');
app.get('/api/eisenkind/notes', async (req, res) => {
  try {
    const notes = await getEisenkindNotes();
    res.json({
      success: true,
      story: notes.story,
      story_updated_at: notes.story_updated_at,
      updated_at: notes.updated_at
    });
  } catch (error) {
    console.error('Error loading eisenkind story:', error);
    res.status(500).json({ success: false, story: '', error: 'Failed to load story' });
  }
});

// Cause effect map graph (public read/write via API)
app.get('/api/cause/graph', async (req, res) => {
  try {
    const graph = await getCauseGraph();
    res.json({ success: true, graph });
  } catch (error) {
    console.error('Error loading cause graph:', error);
    res.status(500).json({ success: false, error: 'Failed to load cause graph' });
  }
});

app.put('/api/cause/graph', async (req, res) => {
  try {
    const { graph } = req.body || {};
    if (!graph || typeof graph !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing graph payload' });
    }

    const result = await saveCauseGraph(graph);
    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error saving cause graph:', error);
    res.status(500).json({ success: false, error: 'Failed to save cause graph' });
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

