const express = require('express');
const crypto = require('crypto');
const { listSupremeNotes, addSupremeNote } = require('../db/supreme');

const router = express.Router();

const PASSWORD = process.env.SUPREME_PASSWORD || 'interstellar';
const COOKIE = 'supreme_auth';
const SECRET = process.env.SESSION_SECRET || 'diary-secret-key-change-in-production';

function token() {
  return crypto.createHmac('sha256', SECRET).update('supreme-gate').digest('hex');
}

function passwordMatches(given) {
  const expected = crypto.createHash('sha256').update(PASSWORD).digest();
  const received = crypto.createHash('sha256').update(String(given || '')).digest();
  return crypto.timingSafeEqual(expected, received);
}

function isUnlocked(req) {
  return req.cookies[COOKIE] === token();
}

function pageSeo() {
  return {
    title: 'supreme',
    description: '',
    path: '/supreme',
    noindex: true,
    includePersonSchema: false,
  };
}

function noStore(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
  });
}

function renderGate(res, { error = null, status = 200 } = {}) {
  noStore(res);
  res.locals.seo = pageSeo();
  res.status(status).render('supreme-gate', { error });
}

function cleanAuthor(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cleanBody(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, 4000);
}

router.post('/supreme/unlock', (req, res) => {
  const given = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!passwordMatches(given)) {
    return renderGate(res, { error: 'wrong password', status: 401 });
  }
  res.cookie(COOKIE, token(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    path: '/supreme',
  });
  res.redirect('/supreme');
});

router.get(['/supreme', '/supreme/'], async (req, res) => {
  noStore(res);
  res.locals.seo = pageSeo();
  if (!isUnlocked(req)) return renderGate(res);
  const listed = await listSupremeNotes();
  res.render('supreme', {
    notes: listed.notes || [],
    saved: req.query.saved === '1',
    error: listed.success ? null : 'could not load notes',
    author: '',
    body: '',
  });
});

router.post(['/supreme', '/supreme/'], async (req, res) => {
  noStore(res);
  res.locals.seo = pageSeo();
  if (!isUnlocked(req)) return renderGate(res);
  const author = cleanAuthor(req.body?.author);
  const body = cleanBody(req.body?.body);
  if (!author || !body) {
    const listed = await listSupremeNotes();
    return res.status(400).render('supreme', {
      notes: listed.notes || [],
      saved: false,
      error: 'write a name and a note',
      author,
      body,
    });
  }
  const saved = await addSupremeNote(author, body);
  if (!saved.success) {
    const listed = await listSupremeNotes();
    return res.status(500).render('supreme', {
      notes: listed.notes || [],
      saved: false,
      error: 'could not save that. try again.',
      author,
      body,
    });
  }
  res.redirect('/supreme?saved=1');
});

module.exports = router;
