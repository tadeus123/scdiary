const db = require('./db');
const { liveCompanies } = require('./proof');

function publicJsonHeaders(res) {
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
}

async function handleLiveCompanies(req, res) {
  if (!db.isConfigured()) {
    publicJsonHeaders(res);
    return res.json([]);
  }
  try {
    publicJsonHeaders(res);
    return res.json(liveCompanies(await db.listLive()));
  } catch (error) {
    console.error('Airsup live-companies error:', error.message);
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    return res.status(503).json({ error: 'unavailable', live: null });
  }
}

module.exports = handleLiveCompanies;
