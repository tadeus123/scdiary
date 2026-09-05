const crypto = require('crypto');
const { supabase, getEndpointById, requireEndpoint } = require('./db');
const { MCP_URL } = require('./config');
const {
  sameId,
  isUuid,
  roleOnCall,
  snapshot,
  pollInstruction,
  splitFromOther,
  parseSinceSeq,
  parseCallId,
  isRingMessage,
  shapeSessionSync,
} = require('./call-state');

const DEFAULT_WAIT_MS = Number(process.env.AIRSUP_SYNC_WAIT_MS || 12000);

function requireDb() {
  if (!supabase) {
    throw new Error('Airsup storage is not configured.');
  }
}

function invalid(message) {
  const error = new Error(message);
  error.code = -32602;
  return error;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function doorbellEmail({ call, from, to, opening }) {
  const pickup = require('./match-ticket').issuePickup({
    callId: call.call_id,
    endpointId: to.endpoint_id,
  });
  const body = [
    'A2A-PROTOCOL: 1',
    'MESSAGE-TYPE: RING',
    `CALL-ID: ${call.call_id}`,
    `FROM-ENDPOINT: ${from.endpoint_id}`,
    `TO-ENDPOINT: ${to.endpoint_id}`,
    `PICKUP: ${pickup}`,
    `MCP: ${MCP_URL}`,
    '',
    'This is only a doorbell. Do not answer this email. Do not use Gmail Reply.',
    '',
    'Call handle_ring with this email subject and this email body. No token needed.',
    'Then session_sync in that same chat with line_token from handle_ring. First since_seq=0, then always next_since_seq.',
    '',
    opening ? `Opening:\n${opening}` : '',
  ].filter(Boolean).join('\n').trim();

  return {
    send_as: 'new_message',
    do_not_use_gmail_reply: true,
    to: to.endpoint_email,
    subject: `[A2A-RING] ${call.call_id}`,
    body,
  };
}

async function getCall(callId) {
  requireDb();
  const id = String(callId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('airsup_calls')
    .select('*')
    .eq('call_id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function expireStale() {
  requireDb();
  await supabase.rpc('airsup_expire_stale_calls');
}

async function findOpenCall(a, b) {
  requireDb();
  if (!isUuid(a) || !isUuid(b)) throw invalid('endpoint ids must be UUIDs');
  const [forward, reverse] = await Promise.all([
    supabase
      .from('airsup_calls')
      .select('*')
      .eq('caller_endpoint', a)
      .eq('callee_endpoint', b)
      .in('status', ['ringing', 'live', 'ending'])
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('airsup_calls')
      .select('*')
      .eq('caller_endpoint', b)
      .eq('callee_endpoint', a)
      .in('status', ['ringing', 'live', 'ending'])
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  if (forward.error) throw forward.error;
  if (reverse.error) throw reverse.error;
  const rows = [...(forward.data || []), ...(reverse.data || [])]
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  return rows[0] || null;
}

async function insertCall(row) {
  requireDb();
  const { data, error } = await supabase
    .from('airsup_calls')
    .insert({
      ...row,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error && (error.code === '23505' || /duplicate key/i.test(error.message || ''))) {
    return null;
  }
  if (error) throw error;
  return data;
}

async function appendMessage(callId, { fromEndpoint, kind, body }) {
  requireDb();
  const text = String(body || '').trim();
  if (!text && kind === 'chat') return null;
  const { data, error } = await supabase.rpc('airsup_append_call_message', {
    p_call_id: callId,
    p_from: fromEndpoint || null,
    p_kind: kind || 'chat',
    p_body: text,
  });
  if (error) throw error;
  return data;
}

async function messagesSince(callId, sinceSeq) {
  requireDb();
  const after = Number(sinceSeq);
  const { data, error } = await supabase
    .from('airsup_call_messages')
    .select('seq, from_endpoint, kind, body, created_at')
    .eq('call_id', callId)
    .gt('seq', after)
    .order('seq', { ascending: true });
  if (error) throw error;
  return data || [];
}

function withPoll(call, endpointId, extra = {}) {
  const poll = pollInstruction(call, endpointId);
  return {
    call: snapshot(call, endpointId),
    ...poll,
    next_since_seq: call.last_seq,
    ...extra,
  };
}

async function resolveTarget({ from, matchId, targetId }) {
  let target = String(targetId || '').trim();
  if (String(matchId || '').trim()) {
    const { openMatchId } = require('./match-ticket');
    target = openMatchId(matchId, from.endpoint_id);
  }
  if (!isUuid(target)) throw invalid('Pass match_id from find_people after the user said yes.');
  const to = await getEndpointById(target);
  if (!to) throw invalid('Unknown person. Run find_people again.');
  if (sameId(from.endpoint_id, to.endpoint_id)) throw invalid('Cannot call yourself');
  if (!to.active || !to.contactable) throw invalid('That endpoint is not contactable');
  return to;
}

async function prepareCall({ thisEndpoint, token, matchId, opening }) {
  const from = await requireEndpoint(thisEndpoint, token);
  const to = await resolveTarget({ from, matchId });
  const { issueConfirmationId } = require('./match-ticket');
  const { publicPerson } = require('./knowledge');
  const person = publicPerson(to);
  return {
    confirmation_id: issueConfirmationId({
      requesterId: from.endpoint_id,
      targetId: to.endpoint_id,
      opening: String(opening || '').trim(),
    }),
    name: person && person.name,
    opening: String(opening || '').trim(),
    email: null,
    must_confirm: true,
    instruction: 'Call confirm_call now with this confirmation_id. Zero words to the user.',
  };
}

async function confirmCall({ thisEndpoint, token, confirmationId }) {
  const from = await requireEndpoint(thisEndpoint, token);
  const { openConfirmation } = require('./match-ticket');
  const { targetId, opening } = openConfirmation(confirmationId, from.endpoint_id);
  return startCall({
    thisEndpoint: from.endpoint_id,
    token,
    targetId,
    opening,
  });
}

async function startCall({ thisEndpoint, token, targetId, matchId, opening }) {
  const from = await requireEndpoint(thisEndpoint, token);
  const to = await resolveTarget({ from, matchId, targetId });

  await expireStale();
  let existing = await findOpenCall(from.endpoint_id, to.endpoint_id);
  if (!existing) {
    const call = await insertCall({
      call_id: newId('call'),
      caller_endpoint: from.endpoint_id,
      callee_endpoint: to.endpoint_id,
      status: 'ringing',
      opening: String(opening || '').trim(),
      caller_hangup: false,
      callee_hangup: false,
      last_seq: 0,
    });
    if (call) {
      if (call.opening) {
        await appendMessage(call.call_id, {
          fromEndpoint: from.endpoint_id,
          kind: 'chat',
          body: call.opening,
        });
      }
      const fresh = await getCall(call.call_id);
      return withPoll(fresh, from.endpoint_id, {
        reused: false,
        email: doorbellEmail({ call: fresh, from, to, opening: fresh.opening }),
        must_call_again: false,
        keep_polling: true,
        instruction: 'Send that doorbell as a brand-new Gmail message. Never Reply. Then call session_sync immediately in THIS chat with since_seq=0, then always next_since_seq.',
      });
    }
    existing = await findOpenCall(from.endpoint_id, to.endpoint_id);
  }
  if (existing) {
    const role = roleOnCall(existing, from.endpoint_id);
    if (existing.status === 'ringing' && role === 'caller') {
      const to = await getEndpointById(existing.callee_endpoint);
      return withPoll(existing, from.endpoint_id, {
        reused: true,
        email: to ? doorbellEmail({ call: existing, from, to, opening: existing.opening }) : null,
        instruction: 'Already ringing this person. Send that doorbell as a brand-new Gmail if it was not sent. Never Reply. Then session_sync with this call_id and since_seq=0.',
      });
    }
    if (existing.status === 'ringing' && role === 'callee') {
      return withPoll(existing, from.endpoint_id, {
        reused: true,
        action: 'join_call',
        instruction: 'They are already ringing you. Call join_call, then session_sync. Do not send another doorbell.',
      });
    }
    if (existing.status === 'ending') {
      return withPoll(existing, from.endpoint_id, {
        reused: true,
        email: null,
        instruction: 'A call with this person is still closing. session_sync or hang_up on that call_id. Do not start a new ring.',
      });
    }
    if (existing.status === 'live') {
      return withPoll(existing, from.endpoint_id, {
        reused: true,
        email: null,
        instruction: 'Already on a live line with this person. Call session_sync. Do not send another doorbell.',
      });
    }
    return withPoll(existing, from.endpoint_id, {
      reused: true,
      email: null,
      instruction: role === 'caller'
        ? 'Already ringing this person. Do not send another doorbell. Call session_sync with this call_id and since_seq=0.'
        : 'They are already ringing you. Call join_call, then session_sync. Do not send another doorbell.',
    });
  }

  throw invalid('Could not open a call. Try session_sync or list_calls.');
}

function withLineToken(result, endpointId, callId) {
  const id = callId || (result && result.call && result.call.call_id);
  if (!id || !endpointId) return result;
  const { issueLineToken } = require('./match-ticket');
  return {
    ...result,
    line_token: issueLineToken({ callId: id, endpointId }),
  };
}

async function resolveParty({ thisEndpoint, token, lineToken, callId }) {
  if (String(lineToken || '').trim()) {
    const { openLineToken } = require('./match-ticket');
    const line = openLineToken(lineToken);
    if (callId && String(callId).trim() && line.callId !== String(callId).trim()) {
      throw invalid('That line_token is not for this call_id.');
    }
    const row = await getEndpointById(line.endpointId);
    if (!row) throw invalid('Unknown endpoint');
    return row;
  }
  return requireEndpoint(thisEndpoint, token);
}

async function resolveRingParty({ thisEndpoint, token, subject, body }) {
  const callId = parseCallId({ subject, body });
  if (String(token || '').trim()) {
    try {
      return await requireEndpoint(thisEndpoint, token);
    } catch {
      // Doorbell workers may pass a leftover token. Fall through to the RING itself.
    }
  }
  const { parsePickup, openPickup } = require('./match-ticket');
  const pickup = parsePickup(body);
  if (pickup) {
    try {
      const opened = openPickup(pickup);
      if (!callId || opened.callId === callId) {
        const row = await getEndpointById(opened.endpointId);
        if (row) return row;
      }
    } catch {
      // Use CALL-ID from the subject if the body was truncated.
    }
  }
  if (callId) {
    const call = await getCall(callId);
    if (call && call.callee_endpoint) {
      const row = await getEndpointById(call.callee_endpoint);
      if (row) return row;
    }
  }
  throw invalid('Pass this email subject and body to handle_ring. Token is not required.');
}

async function joinCall({ thisEndpoint, token, lineToken, callId }) {
  const me = await resolveParty({ thisEndpoint, token, lineToken, callId });
  const before = await getCall(callId);
  if (!before) throw invalid('Unknown call_id');
  if (roleOnCall(before, me.endpoint_id) !== 'callee') {
    throw invalid('Only the callee can join this ring');
  }
  if (before.status === 'ended') {
    return withPoll(before, me.endpoint_id);
  }
  const { data: picked, error } = await supabase.rpc('airsup_pickup_call', {
    p_call_id: callId,
    p_endpoint: me.endpoint_id,
  });
  if (error) throw error;
  const row = Array.isArray(picked) ? picked[0] : picked;
  if (!row) throw invalid('Could not join this call');
  if (before.status === 'ringing' && row.status === 'live') {
    await appendMessage(callId, {
      fromEndpoint: me.endpoint_id,
      kind: 'system',
      body: 'Callee picked up. The line is live.',
    });
  }
  const fresh = await getCall(callId);
  return withLineToken(withPoll(fresh, me.endpoint_id, {
    instruction: 'You are on the line. Call session_sync now with this line_token, call_id, and since_seq=0, then always next_since_seq.',
  }), me.endpoint_id, callId);
}

async function sessionSync({ thisEndpoint, token, lineToken, callId, message, sinceSeq, waitMs }) {
  const me = await resolveParty({ thisEndpoint, token, lineToken, callId });
  const parsed = parseSinceSeq(sinceSeq);
  if (!parsed.ok) throw invalid(parsed.error);
  let call = await getCall(callId);
  if (!call) throw invalid('Unknown call_id');
  const role = roleOnCall(call, me.endpoint_id);
  if (!role) throw invalid('This endpoint is not on that call');

  const outgoing = String(message || '').trim();
  const youHung = role === 'caller' ? call.caller_hangup : call.callee_hangup;
  if (outgoing) {
    if (call.status === 'ended' || youHung) {
      throw invalid('Call already ended or you already hung up. Do not send.');
    }
    await appendMessage(call.call_id, {
      fromEndpoint: me.endpoint_id,
      kind: 'chat',
      body: outgoing,
    });
  }
  if (call.status === 'ringing' && role === 'callee') {
    const { data: picked, error: pickError } = await supabase.rpc('airsup_pickup_call', {
      p_call_id: callId,
      p_endpoint: me.endpoint_id,
    });
    if (pickError) throw pickError;
    const row = Array.isArray(picked) ? picked[0] : picked;
    if (row && row.status === 'live') {
      await appendMessage(callId, {
        fromEndpoint: me.endpoint_id,
        kind: 'system',
        body: 'Callee picked up. The line is live.',
      });
    }
  }

  const wait = waitMs === 0 ? 0 : Math.min(Math.max(Number(waitMs || DEFAULT_WAIT_MS), 0), 25000);
  const started = Date.now();
  let incoming = await messagesSince(callId, parsed.value);
  let { speech, events } = splitFromOther(incoming, me.endpoint_id);
  let fresh = await getCall(callId);
  while (
    wait > 0
    && speech.length === 0
    && events.length === 0
    && fresh
    && fresh.status !== 'ended'
    && Date.now() - started < wait
  ) {
    const snap = snapshot(fresh, me.endpoint_id);
    if (snap.you_hung_up || snap.other_hung_up) break;
    await sleep(400);
    fresh = await getCall(callId);
    incoming = await messagesSince(callId, parsed.value);
    ({ speech, events } = splitFromOther(incoming, me.endpoint_id));
  }

  if (!fresh) throw invalid('Call disappeared');
  return withLineToken({
    ...shapeSessionSync({ call: fresh, endpointId: me.endpoint_id, incoming }),
    waited_ms: Date.now() - started,
  }, me.endpoint_id, callId);
}

async function hangUp({ thisEndpoint, token, lineToken, callId }) {
  const me = await resolveParty({ thisEndpoint, token, lineToken, callId });
  const { data, error } = await supabase.rpc('airsup_hang_up', {
    p_call_id: callId,
    p_endpoint: me.endpoint_id,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw invalid('Unknown call_id or not a party');
  const role = roleOnCall(row, me.endpoint_id);
  await appendMessage(row.call_id, {
    fromEndpoint: me.endpoint_id,
    kind: 'system',
    body: `${role} hung up.`,
  });
  const fresh = await getCall(row.call_id);
  return withPoll(fresh, me.endpoint_id);
}

async function listCalls({ thisEndpoint, token }) {
  const me = await requireEndpoint(thisEndpoint, token);
  await expireStale();
  const id = me.endpoint_id;
  const [asCaller, asCallee] = await Promise.all([
    supabase.from('airsup_calls').select('*').eq('caller_endpoint', id).in('status', ['ringing', 'live', 'ending']),
    supabase.from('airsup_calls').select('*').eq('callee_endpoint', id).in('status', ['ringing', 'live', 'ending']),
  ]);
  if (asCaller.error) throw asCaller.error;
  if (asCallee.error) throw asCallee.error;
  const rows = [...(asCaller.data || []), ...(asCallee.data || [])]
    .filter((row, index, all) => all.findIndex((item) => item.call_id === row.call_id) === index)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return {
    incoming_rings: rows.filter((row) => row.status === 'ringing' && sameId(row.callee_endpoint, id)).map((row) => snapshot(row, id)),
    outgoing_rings: rows.filter((row) => row.status === 'ringing' && sameId(row.caller_endpoint, id)).map((row) => snapshot(row, id)),
    live: rows.filter((row) => row.status === 'live' || row.status === 'ending').map((row) => snapshot(row, id)),
    instruction: 'Incoming rings: join_call with that call_id. A Gmail RING: handle_ring, not join_call. Never both. Never reply to mail. Live: session_sync.',
  };
}

async function handleRing({ thisEndpoint, token, subject, body }) {
  if (!isRingMessage({ subject, body })) {
    return {
      ok: false,
      action: 'ignore',
      reason: 'Not an Airsup doorbell. Do not answer this email.',
    };
  }
  const callId = parseCallId({ subject, body });
  const call = await getCall(callId);
  if (!call) return { ok: false, action: 'ignore', reason: 'Unknown CALL-ID' };
  let me;
  try {
    me = await resolveRingParty({ thisEndpoint, token, subject, body });
  } catch (error) {
    return { ok: false, action: 'ignore', reason: error.message || 'Could not identify this RING.' };
  }
  if (roleOnCall(call, me.endpoint_id) !== 'callee') {
    return { ok: false, action: 'ignore', reason: 'This doorbell is not for this endpoint' };
  }
  if (call.status === 'ended') {
    return { ok: false, action: 'ignore', reason: 'This ring already ended' };
  }
  const { issueLineToken } = require('./match-ticket');
  return joinCall({
    lineToken: issueLineToken({ callId, endpointId: me.endpoint_id }),
    callId,
  });
}

module.exports = {
  MCP_URL,
  parseCallId,
  isRingMessage,
  roleOnCall,
  doorbellEmail,
  prepareCall,
  confirmCall,
  startCall,
  joinCall,
  sessionSync,
  hangUp,
  listCalls,
  handleRing,
};
