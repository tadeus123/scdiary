const crypto = require('crypto');
const { supabase, getEndpointById } = require('./db');
const { MCP_URL } = require('./config');

function requireDb() {
  if (!supabase) {
    throw new Error('Airsup storage is not configured.');
  }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

function sameId(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function parseCallId({ subject, body }) {
  const fromSubject = String(subject || '').match(/\[A2A-RING\]\s*(\S+)/i);
  if (fromSubject) return fromSubject[1].trim();
  const fromBody = String(body || '').match(/^CALL-ID:\s*(.+)$/im);
  return fromBody ? fromBody[1].trim() : '';
}

function isRingMessage({ subject, body }) {
  return /\[A2A-RING\]/i.test(String(subject || ''))
    || /^MESSAGE-TYPE:\s*RING$/im.test(String(body || ''));
}

function roleOnCall(call, endpointId) {
  if (!call) return null;
  if (sameId(call.caller_endpoint, endpointId)) return 'caller';
  if (sameId(call.callee_endpoint, endpointId)) return 'callee';
  return null;
}

function doorbellEmail({ call, from, to, opening }) {
  const body = [
    'A2A-PROTOCOL: 1',
    'MESSAGE-TYPE: RING',
    `CALL-ID: ${call.call_id}`,
    `FROM-ENDPOINT: ${from.endpoint_id}`,
    `TO-ENDPOINT: ${to.endpoint_id}`,
    `MCP: ${MCP_URL}`,
    '',
    'This is only a doorbell. It is not a question. Do not answer this email.',
    'Do not use Gmail Reply.',
    '',
    'Join the live Airsup call with the Airsup plugin:',
    MCP_URL,
    '',
    `join_call({ this_endpoint: "${to.endpoint_id}", call_id: "${call.call_id}" })`,
    'Then keep calling session_sync in this same chat until hang_up.',
    '',
    opening ? `Opening from the other AI:\n${opening}` : '',
  ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').trim();

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

async function findOpenCall(a, b) {
  requireDb();
  const { data, error } = await supabase
    .from('airsup_calls')
    .select('*')
    .in('status', ['ringing', 'live', 'ending'])
    .or(
      `and(caller_endpoint.eq.${a},callee_endpoint.eq.${b}),and(caller_endpoint.eq.${b},callee_endpoint.eq.${a})`
    )
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

async function saveCall(row) {
  requireDb();
  const payload = {
    ...row,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('airsup_calls')
    .upsert(payload, { onConflict: 'call_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function appendMessage(callId, { fromEndpoint, kind, body }) {
  requireDb();
  const text = String(body || '').trim();
  if (!text && kind === 'chat') return null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const call = await getCall(callId);
    if (!call) throw new Error('Unknown call_id');
    const seq = (call.last_seq || 0) + 1;
    const { error } = await supabase.from('airsup_call_messages').insert({
      call_id: callId,
      seq,
      from_endpoint: fromEndpoint || null,
      kind: kind || 'chat',
      body: text,
    });
    if (!error) {
      await supabase
        .from('airsup_calls')
        .update({ last_seq: seq, updated_at: new Date().toISOString() })
        .eq('call_id', callId);
      return seq;
    }
    if (error.code !== '23505') throw error;
  }
  throw new Error('Could not append call message');
}

async function messagesSince(callId, sinceSeq) {
  requireDb();
  const after = Number(sinceSeq) || 0;
  const { data, error } = await supabase
    .from('airsup_call_messages')
    .select('seq, from_endpoint, kind, body, created_at')
    .eq('call_id', callId)
    .gt('seq', after)
    .order('seq', { ascending: true });
  if (error) throw error;
  return data || [];
}

function snapshot(call, endpointId, extra = {}) {
  const role = roleOnCall(call, endpointId);
  return {
    call_id: call.call_id,
    status: call.status,
    role,
    caller_endpoint: call.caller_endpoint,
    callee_endpoint: call.callee_endpoint,
    you_hung_up: role === 'caller' ? call.caller_hangup : call.callee_hangup,
    other_hung_up: role === 'caller' ? call.callee_hangup : call.caller_hangup,
    last_seq: call.last_seq,
    ...extra,
  };
}

function pollInstruction(call) {
  if (call.status === 'ended') {
    return {
      keep_polling: false,
      wait_hint_seconds: 0,
      instruction: 'This call has ended. Do not send more messages on this call_id.',
    };
  }
  if (call.status === 'ringing') {
    return {
      keep_polling: true,
      wait_hint_seconds: 2,
      instruction: 'Stay in this ChatGPT conversation. Call session_sync again. Do not wait for a Gmail reply. Gmail is only the doorbell.',
    };
  }
  if (call.status === 'ending') {
    return {
      keep_polling: true,
      wait_hint_seconds: 1,
      instruction: 'The other side hung up. Tell the user, then call hang_up to close the line.',
    };
  }
  return {
    keep_polling: true,
    wait_hint_seconds: 1,
    instruction: 'The line is live. Use session_sync to talk. Do not use Gmail for the conversation. Call hang_up only when this side is done.',
  };
}

async function startCall({ thisEndpoint, targetEndpoint, opening }) {
  const from = await getEndpointById(thisEndpoint);
  const to = await getEndpointById(targetEndpoint);
  if (!from || !to) throw new Error('Unknown endpoint');
  if (sameId(from.endpoint_id, to.endpoint_id)) throw new Error('Cannot call yourself');
  if (!to.active || !to.contactable) throw new Error('That endpoint is not contactable');

  const existing = await findOpenCall(from.endpoint_id, to.endpoint_id);
  if (existing) {
    const role = roleOnCall(existing, from.endpoint_id);
    if (existing.status === 'ringing' && role === 'callee') {
      return {
        reused: true,
        action: 'join_call',
        call: snapshot(existing, from.endpoint_id),
        instruction: 'They are already ringing you. Call join_call, then session_sync. Do not send another doorbell.',
      };
    }
    return {
      reused: true,
      call: snapshot(existing, from.endpoint_id),
      email: existing.status === 'ringing' && role === 'caller'
        ? doorbellEmail({ call: existing, from, to, opening: existing.opening || opening })
        : null,
      ...pollInstruction(existing),
      instruction: existing.status === 'live'
        ? 'This line is already live. Call session_sync. Do not send Gmail.'
        : 'This ring is already open. Send the doorbell email only if you have not sent it yet, then session_sync in this same chat.',
    };
  }

  const call = await saveCall({
    call_id: newId('call'),
    caller_endpoint: from.endpoint_id,
    callee_endpoint: to.endpoint_id,
    status: 'ringing',
    opening: String(opening || '').trim(),
    caller_hangup: false,
    callee_hangup: false,
    last_seq: 0,
  });
  if (call.opening) {
    await appendMessage(call.call_id, {
      fromEndpoint: from.endpoint_id,
      kind: 'chat',
      body: call.opening,
    });
  }
  const fresh = await getCall(call.call_id);
  return {
    reused: false,
    call: snapshot(fresh, from.endpoint_id),
    email: doorbellEmail({ call: fresh, from, to, opening: fresh.opening }),
    keep_polling: true,
    wait_hint_seconds: 2,
    instruction: 'Send the doorbell as a brand-new Gmail message. Never Reply. Then immediately call session_sync in THIS same chat and keep calling it. Do not end the turn to wait for email. The conversation lives on Airsup, not in Gmail.',
  };
}

async function joinCall({ thisEndpoint, callId }) {
  const call = await getCall(callId);
  if (!call) throw new Error('Unknown call_id');
  const role = roleOnCall(call, thisEndpoint);
  if (role !== 'callee') {
    throw new Error('Only the callee can join this ring');
  }
  if (call.status === 'ended') {
    return { call: snapshot(call, thisEndpoint), keep_polling: false, instruction: 'This call already ended.' };
  }
  if (call.status === 'ringing') {
    await saveCall({
      ...call,
      status: 'live',
    });
    await appendMessage(call.call_id, {
      fromEndpoint: thisEndpoint,
      kind: 'system',
      body: 'Callee picked up. The line is live.',
    });
  }
  const fresh = await getCall(call.call_id);
  return {
    call: snapshot(fresh, thisEndpoint),
    ...pollInstruction(fresh),
    instruction: 'You are on the line. Call session_sync now and keep calling it in this same chat. Talk through Airsup, not Gmail.',
  };
}

async function sessionSync({ thisEndpoint, callId, message, sinceSeq }) {
  const call = await getCall(callId);
  if (!call) throw new Error('Unknown call_id');
  const role = roleOnCall(call, thisEndpoint);
  if (!role) throw new Error('This endpoint is not on that call');

  const outgoing = String(message || '').trim();
  if (outgoing) {
    if (call.status === 'ended') {
      throw new Error('Call already ended. Do not send.');
    }
    await appendMessage(call.call_id, {
      fromEndpoint: thisEndpoint,
      kind: 'chat',
      body: outgoing,
    });
    if (call.status === 'ringing' && role === 'callee') {
      await saveCall({ ...call, status: 'live' });
    }
  }

  const fresh = await getCall(call.call_id);
  const incoming = await messagesSince(call.call_id, sinceSeq);
  const others = incoming.filter((row) => !sameId(row.from_endpoint, thisEndpoint) || row.kind === 'system');
  return {
    call: snapshot(fresh, thisEndpoint),
    messages: incoming,
    new_from_other: others,
    last_seq: fresh.last_seq,
    ...pollInstruction(fresh),
  };
}

async function hangUp({ thisEndpoint, callId }) {
  const call = await getCall(callId);
  if (!call) throw new Error('Unknown call_id');
  const role = roleOnCall(call, thisEndpoint);
  if (!role) throw new Error('This endpoint is not on that call');

  const next = {
    ...call,
    caller_hangup: role === 'caller' ? true : call.caller_hangup,
    callee_hangup: role === 'callee' ? true : call.callee_hangup,
  };

  const both = next.caller_hangup && next.callee_hangup;
  const cancelRing = call.status === 'ringing' && role === 'caller';
  if (both || cancelRing) {
    next.status = 'ended';
    next.ended_at = new Date().toISOString();
  } else if (call.status !== 'ended') {
    next.status = 'ending';
  }

  const saved = await saveCall(next);
  await appendMessage(saved.call_id, {
    fromEndpoint: thisEndpoint,
    kind: 'system',
    body: cancelRing ? 'Caller cancelled the ring.' : `${role} hung up.`,
  });
  const fresh = await getCall(saved.call_id);
  return {
    call: snapshot(fresh, thisEndpoint),
    ...pollInstruction(fresh),
  };
}

async function listCalls({ thisEndpoint }) {
  requireDb();
  const id = String(thisEndpoint || '').trim();
  const { data, error } = await supabase
    .from('airsup_calls')
    .select('*')
    .or(`caller_endpoint.eq.${id},callee_endpoint.eq.${id}`)
    .in('status', ['ringing', 'live', 'ending'])
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  return {
    incoming_rings: rows.filter((row) => row.status === 'ringing' && sameId(row.callee_endpoint, id)).map((row) => snapshot(row, id)),
    outgoing_rings: rows.filter((row) => row.status === 'ringing' && sameId(row.caller_endpoint, id)).map((row) => snapshot(row, id)),
    live: rows.filter((row) => row.status === 'live' || row.status === 'ending').map((row) => snapshot(row, id)),
    instruction: 'Incoming rings: join_call. Live lines: session_sync. Gmail is only a doorbell. If a ring is listed here, join it even if email never arrived.',
  };
}

async function handleRing({ thisEndpoint, subject, body }) {
  if (!isRingMessage({ subject, body })) {
    return {
      ok: false,
      action: 'ignore',
      reason: 'Not an Airsup doorbell. Live talk uses the plugin, not REQUEST/RESPONSE email.',
    };
  }
  const callId = parseCallId({ subject, body });
  const call = await getCall(callId);
  if (!call) {
    return { ok: false, action: 'ignore', reason: 'Unknown CALL-ID' };
  }
  const role = roleOnCall(call, thisEndpoint);
  if (role !== 'callee') {
    return { ok: false, action: 'ignore', reason: 'This doorbell is not for this endpoint' };
  }
  return {
    ok: true,
    action: 'join_call',
    call_id: call.call_id,
    instruction: 'This email is only a ring. Do not answer it. Call join_call, then session_sync. Never treat a RING as a question.',
  };
}

module.exports = {
  MCP_URL,
  parseCallId,
  isRingMessage,
  roleOnCall,
  doorbellEmail,
  startCall,
  joinCall,
  sessionSync,
  hangUp,
  listCalls,
  handleRing,
};
