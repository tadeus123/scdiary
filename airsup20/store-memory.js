const { sha256, randomToken, newId, nowIso, listingTextBlob, resolveListingMedia } = require('./util');

function createMemoryStore() {
  const users = new Map();
  const usersByGoogle = new Map();
  const usersByEmail = new Map();
  const listings = new Map();
  const facts = new Map();
  const intents = new Map();
  const intentEvidence = [];
  const rawEvents = [];
  const conversations = new Map();
  const messages = [];
  let messageSeq = 1;
  const inbox = new Map();
  const clients = new Map();
  const codes = new Map();
  const tokens = new Map();
  const refreshTokens = new Map();
  const traces = new Map();
  const spans = new Map();

  function copyUser(row) {
    return row ? { ...row, google_profile: { ...(row.google_profile || {}) } } : null;
  }

  return {
    isConfigured() {
      return true;
    },

    async upsertUser({ googleId, email, displayName, picture, locale, googleProfile }) {
      const google = String(googleId || '').trim();
      const mail = String(email || '').trim();
      let user = (google && usersByGoogle.get(google)) || (mail && usersByEmail.get(mail.toLowerCase())) || null;
      if (!user) {
        user = {
          user_id: newId(),
          google_id: google || null,
          email: mail,
          display_name: displayName || '',
          picture: picture || '',
          locale: locale || '',
          google_profile: googleProfile || {},
          onboarded_at: null,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        users.set(user.user_id, user);
      } else {
        if (google) user.google_id = google;
        if (mail) user.email = mail;
        if (displayName) user.display_name = displayName;
        if (picture != null) user.picture = picture;
        if (locale != null) user.locale = locale;
        if (googleProfile) user.google_profile = googleProfile;
        user.updated_at = nowIso();
      }
      if (user.google_id) usersByGoogle.set(user.google_id, user);
      if (user.email) usersByEmail.set(user.email.toLowerCase(), user);
      if (!listings.has(user.user_id)) {
        listings.set(user.user_id, {
          user_id: user.user_id,
          body: {},
          text_blob: '',
          media: [],
          updated_at: nowIso(),
        });
      }
      return copyUser(user);
    },

    async getUser(userId) {
      return copyUser(users.get(String(userId || '')));
    },

    async getUserByGoogleId(googleId) {
      return copyUser(usersByGoogle.get(String(googleId || '').trim()));
    },

    async markOnboarded(userId) {
      const user = users.get(String(userId || ''));
      if (!user) return null;
      user.onboarded_at = nowIso();
      user.updated_at = user.onboarded_at;
      return copyUser(user);
    },

    async listUsers() {
      return [...users.values()].map(copyUser);
    },

    async getListing(userId) {
      const row = listings.get(String(userId || ''));
      return row ? { ...row, body: { ...(row.body || {}) }, media: [...(row.media || [])] } : null;
    },

    async upsertListing(userId, { body, media, merge }) {
      const id = String(userId || '');
      const prev = listings.get(id) || {
        user_id: id,
        body: {},
        text_blob: '',
        media: [],
        updated_at: nowIso(),
      };
      const nextBody = merge && body && typeof body === 'object'
        ? { ...(prev.body || {}), ...body }
        : (body != null ? body : prev.body);
      const nextMedia = resolveListingMedia(prev.media, media, merge !== false);
      const row = {
        user_id: id,
        body: nextBody && typeof nextBody === 'object' ? nextBody : { note: String(nextBody || '') },
        media: nextMedia,
        text_blob: listingTextBlob(nextBody, nextMedia),
        updated_at: nowIso(),
      };
      listings.set(id, row);
      return { ...row, body: { ...row.body }, media: [...row.media] };
    },

    async listFacts(userId) {
      return [...facts.values()].filter((f) => f.user_id === userId).map((f) => ({ ...f }));
    },

    async insertFact(row) {
      const fact = {
        fact_id: row.fact_id || newId(),
        user_id: row.user_id,
        statement: String(row.statement || ''),
        confidence: Number(row.confidence != null ? row.confidence : 0.5),
        source: String(row.source || 'inferred'),
        visibility: String(row.visibility || 'endpoint_visible'),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      facts.set(fact.fact_id, fact);
      return { ...fact };
    },

    async listIntents(userId, { activeOnly } = {}) {
      return [...intents.values()]
        .filter((i) => i.user_id === userId)
        .filter((i) => !activeOnly || ['active', 'considering', 'committed'].includes(i.status))
        .map((i) => ({ ...i, conditions: [...(i.conditions || [])] }));
    },

    async insertIntent(row) {
      const intent = {
        intent_id: row.intent_id || newId(),
        user_id: row.user_id,
        type: String(row.type || 'WANT'),
        object: String(row.object || ''),
        status: String(row.status || 'active'),
        strength: Number(row.strength != null ? row.strength : 0.5),
        confidence: Number(row.confidence != null ? row.confidence : 0.5),
        time_horizon: String(row.time_horizon || ''),
        conditions: Array.isArray(row.conditions) ? row.conditions : [],
        visibility: String(row.visibility || 'anonymously_matchable'),
        source: String(row.source || 'inferred'),
        last_evidence_at: row.last_evidence_at || nowIso(),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      intents.set(intent.intent_id, intent);
      return { ...intent, conditions: [...intent.conditions] };
    },

    async insertIntentEvidence(row) {
      const evidence = {
        evidence_id: newId(),
        intent_id: row.intent_id,
        conversation_id: row.conversation_id || null,
        message_id: row.message_id || null,
        evidence_text: String(row.evidence_text || ''),
        created_at: nowIso(),
      };
      intentEvidence.push(evidence);
      return { ...evidence };
    },

    async insertRawEvent({ userId, kind, payload }) {
      const event = {
        event_id: newId(),
        user_id: userId || null,
        kind: String(kind || ''),
        payload: payload && typeof payload === 'object' ? payload : {},
        created_at: nowIso(),
      };
      rawEvents.push(event);
      return { ...event };
    },

    async searchCandidates({ callerUserId, query, limit }) {
      const q = String(query || '').trim().toLowerCase();
      const max = Math.min(Math.max(Number(limit) || 8, 1), 20);
      if (!q) return [];
      const tokens = q.split(/\s+/).filter((t) => t.length > 1);
      const scored = [];
      for (const user of users.values()) {
        if (user.user_id === callerUserId) continue;
        const listing = listings.get(user.user_id);
        const userIntents = [...intents.values()].filter((i) => i.user_id === user.user_id);
        const hay = [
          user.display_name,
          listing && listing.text_blob,
          ...userIntents.map((i) => `${i.type} ${i.object}`),
        ].join('\n').toLowerCase();
        let score = 0;
        for (const token of tokens) {
          if (hay.includes(token)) score += 1;
        }
        if (score > 0) {
          scored.push({
            user: copyUser(user),
            listing: listing ? { ...listing, body: { ...listing.body }, media: [...listing.media] } : null,
            intents: userIntents.map((i) => ({ ...i })),
            score,
          });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, max);
    },

    async insertConversation(row) {
      const conv = {
        conversation_id: row.conversation_id || newId(),
        initiator_id: row.initiator_id,
        recipient_id: row.recipient_id,
        goal: String(row.goal || ''),
        status: 'open',
        summary: String(row.summary || ''),
        created_at: nowIso(),
        updated_at: nowIso(),
        ended_at: null,
      };
      conversations.set(conv.conversation_id, conv);
      return { ...conv };
    },

    async getConversation(conversationId) {
      const row = conversations.get(String(conversationId || ''));
      return row ? { ...row } : null;
    },

    async updateConversation(conversationId, patch) {
      const row = conversations.get(String(conversationId || ''));
      if (!row) return null;
      Object.assign(row, patch, { updated_at: nowIso() });
      return { ...row };
    },

    async insertMessage(row) {
      const msg = {
        message_id: messageSeq++,
        conversation_id: row.conversation_id,
        from_role: String(row.from_role || 'system'),
        from_user_id: row.from_user_id || null,
        body: String(row.body || ''),
        meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
        created_at: nowIso(),
      };
      messages.push(msg);
      return { ...msg, meta: { ...msg.meta } };
    },

    async listMessages(conversationId) {
      return messages
        .filter((m) => m.conversation_id === conversationId)
        .map((m) => ({ ...m, meta: { ...m.meta } }));
    },

    async listPriorBetweenUsers(userA, userB, { limit } = {}) {
      const max = Math.min(Math.max(Number(limit) || 12, 1), 40);
      const pair = [...conversations.values()].filter((c) => (
        (c.initiator_id === userA && c.recipient_id === userB)
        || (c.initiator_id === userB && c.recipient_id === userA)
      ));
      pair.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      const out = [];
      for (const conv of pair.slice(0, 3)) {
        const rows = messages.filter((m) => m.conversation_id === conv.conversation_id);
        for (const row of rows) out.push({ ...row, meta: { ...row.meta } });
      }
      return out.slice(-max);
    },

    async insertInboxItem(row) {
      const item = {
        item_id: newId(),
        user_id: row.user_id,
        from_user_id: row.from_user_id || null,
        conversation_id: row.conversation_id || null,
        reason: String(row.reason || ''),
        summary: String(row.summary || ''),
        payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
        status: String(row.status || 'unread'),
        created_at: nowIso(),
      };
      inbox.set(item.item_id, item);
      return { ...item, payload: { ...item.payload } };
    },

    async listInbox(userId, { status, limit } = {}) {
      const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
      return [...inbox.values()]
        .filter((i) => i.user_id === userId)
        .filter((i) => !status || i.status === status)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, max)
        .map((i) => ({ ...i, payload: { ...i.payload } }));
    },

    async updateInboxItem(itemId, userId, patch) {
      const item = inbox.get(String(itemId || ''));
      if (!item || item.user_id !== userId) return null;
      Object.assign(item, patch);
      return { ...item, payload: { ...item.payload } };
    },

    async insertClient(client) {
      clients.set(client.client_id, { ...client });
      return { ...client };
    },

    async getClient(clientId) {
      const row = clients.get(String(clientId || ''));
      return row ? { ...row } : null;
    },

    async insertCode(row) {
      codes.set(row.code_hash, { ...row });
      return { ...row };
    },

    async takeCode(codeHash) {
      const row = codes.get(String(codeHash || ''));
      if (!row) return null;
      codes.delete(String(codeHash || ''));
      return { ...row };
    },

    async insertPluginToken({ tokenHash, refreshHash, userId, expiresAt }) {
      const row = {
        token_hash: tokenHash,
        refresh_hash: refreshHash,
        user_id: userId,
        expires_at: expiresAt,
        created_at: nowIso(),
      };
      tokens.set(tokenHash, row);
      if (refreshHash) refreshTokens.set(refreshHash, row);
      return { ...row };
    },

    async getPluginToken(tokenHash) {
      const row = tokens.get(String(tokenHash || ''));
      if (!row) return null;
      if (new Date(row.expires_at).getTime() < Date.now()) return null;
      return { ...row };
    },

    async takeRefreshToken(refreshHash) {
      const row = refreshTokens.get(String(refreshHash || ''));
      if (!row) return null;
      refreshTokens.delete(String(refreshHash || ''));
      tokens.delete(row.token_hash);
      return { ...row };
    },

    async insertTrace(row) {
      const trace = {
        trace_id: row.trace_id || newId(),
        user_id: row.user_id || null,
        tool_name: String(row.tool_name || ''),
        status: String(row.status || 'running'),
        started_at: row.started_at || nowIso(),
        ended_at: row.ended_at || null,
        duration_ms: row.duration_ms != null ? row.duration_ms : null,
        meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
      };
      traces.set(trace.trace_id, trace);
      return { ...trace, meta: { ...trace.meta } };
    },

    async updateTrace(traceId, patch) {
      const row = traces.get(String(traceId || ''));
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row, meta: { ...(row.meta || {}) } };
    },

    async getTrace(traceId) {
      const row = traces.get(String(traceId || ''));
      return row ? { ...row, meta: { ...(row.meta || {}) } } : null;
    },

    async listTraces(userId, { limit } = {}) {
      const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
      return [...traces.values()]
        .filter((t) => !userId || t.user_id === userId)
        .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
        .slice(0, max)
        .map((t) => ({ ...t, meta: { ...(t.meta || {}) } }));
    },

    async insertSpan(row) {
      const span = {
        span_id: row.span_id || newId(),
        trace_id: row.trace_id,
        parent_span_id: row.parent_span_id || null,
        name: String(row.name || ''),
        started_at: row.started_at || nowIso(),
        ended_at: row.ended_at || null,
        duration_ms: row.duration_ms != null ? row.duration_ms : null,
        meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
        error: row.error || null,
      };
      spans.set(span.span_id, span);
      return { ...span, meta: { ...span.meta } };
    },

    async updateSpan(spanId, patch) {
      const row = spans.get(String(spanId || ''));
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row, meta: { ...(row.meta || {}) } };
    },

    async listSpans(traceId) {
      return [...spans.values()]
        .filter((s) => s.trace_id === traceId)
        .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
        .map((s) => ({ ...s, meta: { ...(s.meta || {}) } }));
    },
  };
}

module.exports = {
  createMemoryStore,
  sha256,
  randomToken,
  newId,
};
