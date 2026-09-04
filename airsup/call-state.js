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
    last_seq: call.last_seq,
    ...extra,
  };
}

function hangupNext(call, endpointId) {
  const role = roleOnCall(call, endpointId);
  if (!role) return null;
  const callerHangup = call.caller_hangup || role === 'caller';
  const calleeHangup = call.callee_hangup || role === 'callee';
  const cancelRing = call.status === 'ringing' && role === 'caller';
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

function pollInstruction(call, endpointId) {
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
      wait_hint_seconds: 2,
      instruction: 'Still ringing. Call session_sync again immediately (it waits for pickup). Do not wait for Gmail. Do not talk to the user instead of syncing.',
    };
  }
  return {
    keep_polling: true,
    must_call_again: true,
    wait_hint_seconds: 1,
    instruction: 'Line is live. If must_call_again is true, call session_sync again immediately before chatting with the user. Pass since_seq = last_seq from this result.',
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
  pollInstruction,
  parseCallId,
  isRingMessage,
};
