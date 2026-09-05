const crypto = require('crypto');

const MATCH_TTL_MS = 2 * 60 * 60 * 1000;
const CONFIRM_TTL_MS = 30 * 60 * 1000;
const PICKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LINE_TTL_MS = 24 * 60 * 60 * 1000;
const OPENING_MAX = 2000;

function secret() {
  return process.env.AIRSUP_SESSION_SECRET || process.env.SESSION_SECRET || 'airsup-dev-secret';
}

function sign(kind, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(`${kind}.${body}`).digest('base64url');
  return `${kind}.${body}.${sig}`;
}

function openTicket(kind, ticket, requesterId) {
  const raw = String(ticket || '').trim();
  const mine = String(requesterId || '').trim();
  const parts = raw.split('.');
  const bad = () => {
    const error = new Error(
      kind === 'c'
        ? 'Pass confirmation_id from prepare_call. Do not invent it.'
        : 'Pass match_id from find_people. Do not invent an endpoint.'
    );
    error.code = -32602;
    throw error;
  };
  if (parts.length !== 3 || parts[0] !== kind) bad();
  const [, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret()).update(`${kind}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) bad();
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    bad();
  }
  if (!payload || payload.r !== mine || !payload.t) {
    const error = new Error(
      kind === 'c'
        ? 'That confirmation is not for this listing. Run find_people again.'
        : 'That match_id is not for this listing. Run find_people again.'
    );
    error.code = -32602;
    throw error;
  }
  if (Number(payload.e) < Date.now()) {
    const error = new Error(
      kind === 'c'
        ? 'That confirmation expired. Run find_people, then prepare_call again.'
        : 'That match expired. Run find_people again.'
    );
    error.code = -32602;
    throw error;
  }
  return payload;
}

function openSigned(kind, ticket) {
  const raw = String(ticket || '').trim();
  const parts = raw.split('.');
  const bad = () => {
    const error = new Error('Pass the value from the RING email or from handle_ring. Do not invent it.');
    error.code = -32602;
    throw error;
  };
  if (parts.length !== 3 || parts[0] !== kind) bad();
  const [, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret()).update(`${kind}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) bad();
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    bad();
  }
  if (!payload || !payload.c || !payload.t || Number(payload.e) < Date.now()) {
    const error = new Error('That RING pickup expired. Use the current RING email.');
    error.code = -32602;
    throw error;
  }
  return payload;
}

function issueMatchId({ requesterId, targetId }) {
  const r = String(requesterId || '').trim();
  const t = String(targetId || '').trim();
  if (!r || !t) return '';
  return sign('m', { r, t, e: Date.now() + MATCH_TTL_MS });
}

function openMatchId(matchId, requesterId) {
  return String(openTicket('m', matchId, requesterId).t);
}

function issueConfirmationId({ requesterId, targetId, opening }) {
  const r = String(requesterId || '').trim();
  const t = String(targetId || '').trim();
  if (!r || !t) return '';
  return sign('c', {
    r,
    t,
    o: String(opening || '').trim().slice(0, OPENING_MAX),
    e: Date.now() + CONFIRM_TTL_MS,
  });
}

function openConfirmation(confirmationId, requesterId) {
  const payload = openTicket('c', confirmationId, requesterId);
  return {
    targetId: String(payload.t),
    opening: String(payload.o || ''),
  };
}

function issuePickup({ callId, endpointId }) {
  const c = String(callId || '').trim();
  const t = String(endpointId || '').trim();
  if (!c || !t) return '';
  return sign('p', { c, t, e: Date.now() + PICKUP_TTL_MS });
}

function openPickup(pickup) {
  const payload = openSigned('p', pickup);
  return {
    callId: String(payload.c),
    endpointId: String(payload.t),
  };
}

function parsePickup(body) {
  const hit = String(body || '').match(/^PICKUP:\s*(\S+)/im);
  return hit ? hit[1].trim() : '';
}

function issueLineToken({ callId, endpointId }) {
  const c = String(callId || '').trim();
  const t = String(endpointId || '').trim();
  if (!c || !t) return '';
  return sign('l', { c, t, e: Date.now() + LINE_TTL_MS });
}

function openLineToken(lineToken) {
  const payload = openSigned('l', lineToken);
  return {
    callId: String(payload.c),
    endpointId: String(payload.t),
  };
}

module.exports = {
  issueMatchId,
  openMatchId,
  issueConfirmationId,
  openConfirmation,
  issuePickup,
  openPickup,
  parsePickup,
  issueLineToken,
  openLineToken,
};
