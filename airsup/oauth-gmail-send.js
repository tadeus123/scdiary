const { GMAIL_SENDER, GMAIL_SEND_SCOPE } = require('./config');
const websiteAuth = require('./auth');

function startConnect(req, res) {
  const user = websiteAuth.readUser(req);
  if (!user) return res.redirect('/airsup');
  if (String(user.email || '').toLowerCase() !== GMAIL_SENDER) {
    return res.status(403).send('Wake mail can only be connected as tademehl@gmail.com.');
  }
  const state = websiteAuth.setOauthState(req, res, { purpose: 'gmail_send' });
  return res.redirect(websiteAuth.googleAuthUrl(req, state, {
    scope: GMAIL_SEND_SCOPE,
    prompt: 'consent',
    accessType: 'offline',
  }));
}

module.exports = {
  startConnect,
  GMAIL_SEND_SCOPE,
};
