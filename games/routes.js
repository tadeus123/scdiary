/**
 * Games-only routes. Mounted at /games.
 * Do not import diary, admin, or server/db/supabase.js from here.
 */
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const db = require('./db');
const { PHRASES } = require('./phrases');
const { ROUND_SECONDS, computeScore, isPlausibleRun } = require('./score');

const router = express.Router();
const GAMES_VIEWS = path.join(__dirname, 'views');
const SITE_VIEWS = path.join(__dirname, '../views');

function renderGames(req, res, viewName, extra = {}) {
  const viewFile = path.join(GAMES_VIEWS, viewName);
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
      views: [GAMES_VIEWS, SITE_VIEWS],
      root: SITE_VIEWS,
    },
    (err, html) => {
      if (err) {
        console.error('Games render error:', err);
        return res.status(500).send('Failed to render');
      }
      res.send(html);
    }
  );
}

router.use((req, res, next) => {
  res.locals.seo = {
    title: 'Tade Mehl — speed typing',
    description: 'A 45-second English speed-typing sprint. Score is WPM with a mistake penalty.',
    path: '/games',
    noindex: true,
    includePersonSchema: false,
  };
  next();
});

router.get(['/', ''], async (req, res) => {
  let highscore = { score: 0, wpm: 0, mistakes: 0, created_at: null };
  try {
    highscore = await db.getHighscore();
  } catch (err) {
    console.error('Games highscore load failed:', err);
  }
  renderGames(req, res, 'index.ejs', {
    phrases: PHRASES,
    highscore,
    roundSeconds: ROUND_SECONDS,
  });
});

router.get('/api/highscore', async (req, res) => {
  try {
    const highscore = await db.getHighscore();
    res.json({ success: true, highscore });
  } catch (err) {
    console.error('Games highscore get failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load high score' });
  }
});

router.post('/api/score', async (req, res) => {
  try {
    const body = req.body || {};
    const wpm = Number(body.wpm);
    const mistakes = Number(body.mistakes);
    const score = body.score == null ? computeScore(wpm, mistakes) : Number(body.score);
    if (!isPlausibleRun({ wpm, mistakes, score })) {
      return res.status(400).json({ success: false, error: 'Invalid score' });
    }
    const result = await db.submitScore({ score, wpm, mistakes });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Games score post failed:', err);
    res.status(500).json({ success: false, error: 'Failed to save score' });
  }
});

module.exports = router;
