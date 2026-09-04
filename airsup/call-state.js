function sameId(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

function roleOnCall(call, endpointId) {
  if (!call) return null;
  if (sameId(call.caller_endpoint, endpointId)) return 'caller';
  if (sameId(call.callee_endpoint, endpointId)) return 'callee';
  return null;
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
    ...extra,
  };
}

function hangupNext(call, endpointId) {
  const role = roleOnCall(call, endpointId);
  if (!role) return null;
  const callerHangup = call.caller_hangup || role === 'caller';
  const calleeHangup = call.callee_hangup || role === 'callee';
  const cancelRing = call.status === 'ringing';
  const both = callerHangup && calleeHangup;
  let status = call.status;
  if (call.status === 'ended') status = 'ended';
  else if (cancelRing || both) status = 'ended';
  else status = 'ending';
  return {
    ...call,
    caller_hangup: callerHangup,
    callee_hangup: calleeHangup,
    status,
  };
}

function filterNewFromOther(messages, endpointId) {
  return (messages || []).filter((row) => !sameId(row.from_endpoint, endpointId));
}

function splitFromOther(messages, endpointId) {
  const fromOther = filterNewFromOther(messages, endpointId);
  return {
    speech: fromOther.filter((row) => row.kind === 'chat'),
    events: fromOther.filter((row) => row.kind !== 'chat'),
  };
}

function parseSinceSeq(sinceSeq) {
  if (sinceSeq === undefined || sinceSeq === null || sinceSeq === '') {
    return {
      ok: false,
      error: 'since_seq is required. Use 0 the first time, then always next_since_seq.',
    };
  }
  const n = Number(sinceSeq);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: 'since_seq must be a number >= 0' };
  }
  return { ok: true, value: Math.floor(n) };
}

function pollInstruction(call, endpointId, { speechCount = 0 } = {}) {
  const role = roleOnCall(call, endpointId);
  const youHung = role === 'caller' ? call.caller_hangup : call.callee_hangup;
  const otherHung = role === 'caller' ? call.callee_hangup : call.caller_hangup;
  if (call.status === 'ended') {
    return {
      keep_polling: false,
      must_call_again: false,
      wait_hint_seconds: 0,
      instruction: 'This call has ended. Do not send more messages on this call_id.',
    };
  }
  if (youHung && !otherHung) {
    return {
      keep_polling: false,
      must_call_again: false,
      wait_hint_seconds: 0,
      instruction: 'You hung up. The line stays until the other side hangs up too. Do not send more on this call.',
    };
  }
  if (speechCount > 0) {
    return {
      keep_polling: true,
      must_call_again: false,
      wait_hint_seconds: 0,
      instruction: otherHung
        ? 'Relay ONLY new_from_other to the user now. Then call hang_up.'
        : 'Relay ONLY new_from_other to the user now. Then call session_sync with their reply as message (or empty) and since_seq=next_since_seq.',
    };
  }
  if (otherHung && !youHung) {
    return {
      keep_polling: true,
      must_call_again: true,
      wait_hint_seconds: 1,
      instruction: 'The other side hung up. Tell the user, then call hang_up to close the line.',
    };
  }
  if (call.status === 'ringing') {
    return {
      keep_polling: true,
      must_call_again: true,
      wait_hint_seconds: 12,
      instruction: 'Still ringing. Call session_sync again immediately. Pass since_seq=next_since_seq. Do not talk to the user instead of syncing.',
    };
  }
  return {
    keep_polling: true,
    must_call_again: true,
    wait_hint_seconds: 1,
    instruction: 'No new speech. Call session_sync again immediately. Do not ask the user. Pass since_seq=next_since_seq.',
  };
}

function shapeSessionSync({ call, endpointId, incoming }) {
  if (!call) {
    return {
      keep_polling: false,
      must_call_again: false,
      wait_hint_seconds: 0,
      instruction: 'Call not found. Stop.',
      next_since_seq: 0,
      new_from_other: [],
      events: [],
    };
  }
  const { speech, events } = splitFromOther(incoming, endpointId);
  return {
    call: snapshot(call, endpointId),
    ...pollInstruction(call, endpointId, { speechCount: speech.length }),
    next_since_seq: call.last_seq,
    new_from_other: speech,
    events,
  };
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

module.exports = {
  sameId,
  isUuid,
  roleOnCall,
  snapshot,
  hangupNext,
  filterNewFromOther,
  splitFromOther,
  parseSinceSeq,
  pollInstruction,
  shapeSessionSync,
  parseCallId,
  isRingMessage,
};
