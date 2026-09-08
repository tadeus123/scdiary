const { GMAIL_SENDER } = require('./config');
const { listingText } = require('./listing');

function wakeSubject(callerName) {
  const name = String(callerName || 'Airsup').trim() || 'Airsup';
  return `[AIRSUP] ${name}`;
}

function wakeBody({ conversationId, message, caller }) {
  const context = listingText({
    answers: caller && caller.listing && caller.listing.answers,
    displayName: caller && caller.display_name,
    email: caller && caller.email,
  });
  return [
    'conversation_id',
    String(conversationId),
    '',
    `users prompt: ${String(message || '')}`,
    '',
    'person context:',
    context,
    '',
    'from the person that calls',
  ].join('\n');
}

function rfc822({ from, to, subject, body }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

function createMailer({ store, decryptSecret, fetchImpl }) {
  const fetchFn = fetchImpl || fetch;
  return {
    async sendWakeEmail({ to, conversationId, message, caller }) {
      const grant = await store.getGmailSend();
      if (!grant || !grant.refresh_token_enc) {
        const err = new Error('Wake mail is not connected.');
        err.status = 'failed';
        throw err;
      }
      const refreshToken = decryptSecret(grant.refresh_token_enc);
      const tokenRes = await fetchFn('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.AIRSUP_GOOGLE_CLIENT_ID || '',
          client_secret: process.env.AIRSUP_GOOGLE_CLIENT_SECRET || '',
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.access_token) {
        const err = new Error(tokenJson.error_description || tokenJson.error || 'Gmail access token failed');
        err.status = 'failed';
        throw err;
      }
      const subject = wakeSubject(caller && caller.display_name);
      const raw = rfc822({
        from: GMAIL_SENDER,
        to,
        subject,
        body: wakeBody({ conversationId, message, caller }),
      });
      const sendRes = await fetchFn('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });
      if (!sendRes.ok) {
        const err = new Error('Gmail users.messages.send failed');
        err.status = 'failed';
        throw err;
      }
      return { to, subject };
    },
  };
}

module.exports = {
  wakeSubject,
  wakeBody,
  rfc822,
  createMailer,
};
