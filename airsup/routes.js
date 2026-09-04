/**
 * Airsup-only routes. Mounted at /airsup.
 * Do not import diary, admin, or server/db/supabase.js from here.
 */
const path = require('path');
const express = require('express');
const ejs = require('ejs');

const router = express.Router();
const AIRSUP_VIEWS = path.join(__dirname, 'views');
const SITE_VIEWS = path.join(__dirname, '../views');

router.use((req, res, next) => {
  const suffix = req.path === '/' ? '' : req.path;
  res.locals.seo = {
    title: 'Tade Mehl — airsup',
    description: 'Airsup — Tade Mehl.',
    path: `/airsup${suffix}`,
    noindex: true,
    includePersonSchema: false,
  };
  next();
});

function renderAirsup(req, res, viewName, extra = {}) {
  const viewFile = path.join(AIRSUP_VIEWS, viewName);
  const locals = {
    ...res.app.locals,
    ...res.locals,
    ...extra,
  };
  ejs.renderFile(
    viewFile,
    locals,
    {
      filename: viewFile,
      views: [AIRSUP_VIEWS, SITE_VIEWS],
      root: SITE_VIEWS,
    },
    (err, html) => {
      if (err) {
        console.error('Airsup render error:', err);
        return res.status(500).send('Failed to render');
      }
      res.send(html);
    }
  );
}

router.get(['/', ''], (req, res) => {
  renderAirsup(req, res, 'index.ejs');
});

module.exports = router;
