const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function randomToken(prefix, bytes = 24) {
  return `${prefix}${crypto.randomBytes(bytes).toString('hex')}`;
}

function newId() {
  return crypto.randomUUID();
}

function createMemoryStore() {
  const people = new Map();
  const peopleByGoogle = new Map();
  const peopleByEmail = new Map();
  const tokens = new Map();
  const refreshTokens = new Map();
  const clients = new Map();
  const codes = new Map();
  const conversations = new Map();
  const messages = [];
  let gmailSend = null;

  return {
    async upsertPerson({ googleId, email, displayName, listing }) {
      const google = String(googleId || '').trim();
      const mail = String(email || '').trim();
      const mailKey = mail.toLowerCase();
      let person = (google && peopleByGoogle.get(google)) || (mailKey && peopleByEmail.get(mailKey)) || null;
      if (!person) {
        person = {
          person_id: newId(),
          google_id: google || null,
          email: mail,
          display_name: displayName || '',
          listing: listing || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        people.set(person.person_id, person);
      } else {
        if (google) person.google_id = google;
        if (mail) person.email = mail;
        if (displayName) person.display_name = displayName;
        if (listing) person.listing = listing;
        person.updated_at = new Date().toISOString();
      }
      if (person.google_id) peopleByGoogle.set(person.google_id, person);
      if (person.email) peopleByEmail.set(person.email.toLowerCase(), person);
      return { ...person };
    },

    async getPerson(personId) {
      const row = people.get(String(personId || ''));
      return row ? { ...row } : null;
    },

    async listPeople() {
      return [...people.values()].map((row) => ({ ...row }));
    },

    async insertClient(client) {
      clients.set(client.client_id, { ...client });
      return client;
    },

    async getClient(clientId) {
      const row = clients.get(String(clientId || ''));
      return row ? { ...row } : null;
    },

    async insertCode(row) {
      codes.set(row.code_hash, { ...row });
    },

    async takeCode(codeHash) {
      const row = codes.get(codeHash);
      if (!row) return null;
      codes.delete(codeHash);
      return { ...row };
    },

    async insertPluginToken({ tokenHash, refreshHash, personId, expiresAt }) {
      tokens.set(tokenHash, { person_id: personId, refresh_hash: refreshHash, expires_at: expiresAt });
      if (refreshHash) refreshTokens.set(refreshHash, tokenHash);
    },

    async getPluginToken(tokenHash) {
      const row = tokens.get(tokenHash);
      if (!row) return null;
      if (new Date(row.expires_at).getTime() < Date.now()) return null;
      return { ...row };
    },

    async takeRefreshToken(refreshHash) {
      const tokenHash = refreshTokens.get(refreshHash);
      if (!tokenHash) return null;
      const row = tokens.get(tokenHash);
      tokens.delete(tokenHash);
      refreshTokens.delete(refreshHash);
      return row ? { ...row } : null;
    },

    async getGmailSend() {
      return gmailSend ? { ...gmailSend } : null;
    },

    async setGmailSend(row) {
      gmailSend = { ...row, id: 'tademehl' };
      return { ...gmailSend };
    },

    async insertConversation(row) {
      const conversation_id = row.conversation_id || newId();
      const saved = {
        conversation_id,
        participant_a: row.participant_a,
        participant_b: row.participant_b,
        status: row.status || 'open',
        unmatched_from: row.unmatched_from || null,
        unmatched_text: row.unmatched_text || null,
        parked_for: row.parked_for || null,
        parked_text: row.parked_text || null,
        inflight: row.inflight || null,
        wake_sent_at: row.wake_sent_at || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ended_at: row.ended_at || null,
      };
      conversations.set(conversation_id, saved);
      return { ...saved };
    },

    async getConversation(conversationId) {
      const row = conversations.get(String(conversationId || ''));
      return row ? { ...row } : null;
    },

    async updateConversation(conversationId, patch, where = {}) {
      const row = conversations.get(String(conversationId || ''));
      if (!row) return null;
      for (const [key, value] of Object.entries(where)) {
        if (row[key] !== value) return null;
      }
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return { ...row };
    },

    async insertMessage({ conversationId, fromPersonId, body }) {
      const row = {
        message_id: messages.length + 1,
        conversation_id: conversationId,
        from_person_id: fromPersonId,
        body,
        created_at: new Date().toISOString(),
      };
      messages.push(row);
      return { ...row };
    },
  };
}

module.exports = {
  sha256,
  randomToken,
  newId,
  createMemoryStore,
};
