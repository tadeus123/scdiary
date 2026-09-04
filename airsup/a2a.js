const crypto = require('crypto');
const { supabase, getEndpointById } = require('./db');

const PROTOCOL_VERSION = '1';
const RULE = 'REQUESTS are answered. RESPONSES are delivered. RESPONSES are never automatically answered.';

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

function envelopeLines(fields) {
  return [
    `A2A-PROTOCOL: ${fields.protocol || PROTOCOL_VERSION}`,
    `MESSAGE-TYPE: ${fields.messageType}`,
    `MESSAGE-ID: ${fields.messageId}`,
    `REQUEST-ID: ${fields.requestId}`,
    `CONVERSATION-ID: ${fields.conversationId}`,
    `FROM-ENDPOINT: ${fields.fromEndpoint}`,
    `TO-ENDPOINT: ${fields.toEndpoint}`,
    `IN-REPLY-TO: ${fields.inReplyTo || 'none'}`,
    `RESPONSE-EXPECTED: ${fields.responseExpected}`,
  ].join('\n');
}

function parseEnvelope(body) {
  const source = String(body || '');
  const get = (name) => {
    const match = source.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'));
    return match ? match[1].trim() : '';
  };
  return {
    protocol: get('A2A-PROTOCOL'),
    messageType: get('MESSAGE-TYPE').toUpperCase(),
    messageId: get('MESSAGE-ID'),
    requestId: get('REQUEST-ID'),
    conversationId: get('CONVERSATION-ID'),
    fromEndpoint: get('FROM-ENDPOINT'),
    toEndpoint: get('TO-ENDPOINT'),
    inReplyTo: get('IN-REPLY-TO'),
    responseExpected: get('RESPONSE-EXPECTED').toUpperCase(),
  };
}

function bodyAfterEnvelope(body) {
  const source = String(body || '').replace(/\r\n/g, '\n');
  const parts = source.split(/\n\n/);
  if (parts.length < 2) return source.replace(/^A2A-PROTOCOL:[\s\S]*?(?:\n\n|$)/, '').trim();
  return parts.slice(1).join('\n\n').trim();
}

/**
 * The server decides the channel. Body instructions cannot flip a RESPONSE into a REQUEST.
 * [A2A-RESPONSE] in the subject always wins. Envelope MESSAGE-TYPE: RESPONSE also wins,
 * so a Gmail Reply that kept an [A2A-REQUEST] subject still cannot retrigger the request worker.
 */
function classifyMessage({ subject, envelope }) {
  const sub = String(subject || '');
  const envelopeType = envelope && envelope.messageType;
  if (/\[A2A-RESPONSE\]/i.test(sub)) return 'RESPONSE';
  if (envelopeType === 'RESPONSE') return 'RESPONSE';
  if (/\[A2A-REQUEST\]/i.test(sub)) return 'REQUEST';
  if (envelopeType === 'REQUEST') return 'REQUEST';
  return null;
}

function workerFor(type) {
  if (type === 'REQUEST') return 'request_worker';
  if (type === 'RESPONSE') return 'response_worker';
  return null;
}

function requestWrite(row) {
  return {
    request_id: row.request_id,
    conversation_id: row.conversation_id,
    originating_endpoint: row.originating_endpoint,
    target_endpoint: row.target_endpoint,
    request: row.request || '',
    answer: row.answer || '',
    status: row.status,
    response_sent_at: row.response_sent_at || null,
    answered_at: row.answered_at || null,
    updated_at: new Date().toISOString(),
  };
}

async function insertMessage(row) {
  requireDb();
  const payload = {
    ...row,
    gmail_message_id: row.gmail_message_id || null,
  };
  const { data, error } = await supabase
    .from('airsup_network_messages')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      const dup = new Error('duplicate');
      dup.duplicate = true;
      throw dup;
    }
    throw error;
  }
  return data;
}

async function getMessage({ messageId, gmailMessageId }) {
  requireDb();
  if (messageId) {
    const { data, error } = await supabase
      .from('airsup_network_messages')
      .select('*')
      .eq('message_id', messageId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (gmailMessageId) {
    const { data, error } = await supabase
      .from('airsup_network_messages')
      .select('*')
      .eq('gmail_message_id', gmailMessageId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return null;
}

async function markProcessed(messageId) {
  if (!messageId) return;
  requireDb();
  const { error } = await supabase
    .from('airsup_network_messages')
    .update({ already_processed: true })
    .eq('message_id', messageId);
  if (error) throw error;
}

async function getRequest(requestId) {
  requireDb();
  const { data, error } = await supabase
    .from('airsup_network_requests')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertRequest(row) {
  requireDb();
  const { data, error } = await supabase
    .from('airsup_network_requests')
    .upsert(requestWrite(row), { onConflict: 'request_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function outboundEmail({ type, envelope, toEmail, payload }) {
  const tag = type === 'RESPONSE' ? '[A2A-RESPONSE]' : '[A2A-REQUEST]';
  return {
    send_as: 'new_message',
    do_not_use_gmail_reply: true,
    to: toEmail,
    subject: `${tag} ${envelope.requestId}`,
    body: `${envelopeLines(envelope)}\n\n${payload}`.trim(),
    envelope,
  };
}

async function lastInboundRequestMessageId(requestId) {
  requireDb();
  const { data, error } = await supabase
    .from('airsup_network_messages')
    .select('message_id')
    .eq('request_id', requestId)
    .eq('message_type', 'REQUEST')
    .eq('channel', 'request_worker')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data[0] ? data[0].message_id : null;
}

async function createNetworkRequest({ fromEndpoint, targetEndpoint, request, conversationId }) {
  const from = await getEndpointById(fromEndpoint);
  const target = await getEndpointById(targetEndpoint);
  if (!from || !target) throw new Error('Unknown endpoint');
  if (from.endpoint_id === target.endpoint_id) throw new Error('Cannot request yourself');

  const requestId = newId('req');
  const conversation = conversationId || newId('conv');
  const messageId = newId('msg');
  const payload = String(request || '').trim();

  const saved = await upsertRequest({
    request_id: requestId,
    conversation_id: conversation,
    originating_endpoint: from.endpoint_id,
    target_endpoint: target.endpoint_id,
    request: payload,
    answer: '',
    status: 'waiting',
  });

  const envelope = {
    protocol: PROTOCOL_VERSION,
    messageType: 'REQUEST',
    messageId,
    requestId,
    conversationId: conversation,
    fromEndpoint: from.endpoint_id,
    toEndpoint: target.endpoint_id,
    inReplyTo: 'none',
    responseExpected: 'YES',
  };

  return {
    request: saved,
    email: outboundEmail({
      type: 'REQUEST',
      envelope,
      toEmail: target.endpoint_email,
      payload,
    }),
    instruction: 'Send this as a brand-new Gmail message. Do not use Reply. Do not keep a previous subject. The original chat will not stay open; later call get_network_results().',
  };
}

async function createNetworkResponse({ thisEndpoint, requestId, answer, inboundMessageId }) {
  const request = await getRequest(requestId);
  if (!request) throw new Error('Unknown request_id');
  if (!sameId(request.target_endpoint, thisEndpoint)) {
    throw new Error('This endpoint is not the target of that request');
  }
  if (request.response_sent_at) {
    throw new Error('This request was already answered. Never respond twice to the same MESSAGE-ID / request.');
  }

  const from = await getEndpointById(thisEndpoint);
  const to = await getEndpointById(request.originating_endpoint);
  if (!from || !to) throw new Error('Unknown endpoint');

  const messageId = newId('msg');
  const lastInbound = inboundMessageId || await lastInboundRequestMessageId(requestId);

  await upsertRequest({
    ...request,
    response_sent_at: new Date().toISOString(),
  });
  await markProcessed(lastInbound);

  const envelope = {
    protocol: PROTOCOL_VERSION,
    messageType: 'RESPONSE',
    messageId,
    requestId,
    conversationId: request.conversation_id,
    fromEndpoint: from.endpoint_id,
    toEndpoint: to.endpoint_id,
    inReplyTo: lastInbound || 'none',
    responseExpected: 'NO',
  };

  return {
    email: outboundEmail({
      type: 'RESPONSE',
      envelope,
      toEmail: to.endpoint_email,
      payload: String(answer || '').trim(),
    }),
    instruction: 'Send this as a brand-new Gmail message with subject [A2A-RESPONSE]. Do not use Gmail Reply. A reply would keep the request subject and can retrigger the request worker.',
  };
}

async function duplicateResult(existing, type) {
  if (existing && type === 'REQUEST') {
    const pending = await getRequest(existing.request_id);
    if (pending && pending.response_sent_at) {
      return {
        ok: true,
        duplicate: true,
        action: 'ignore',
        type,
        channel: 'request_worker',
        reason: 'This REQUEST was already answered. Never respond twice.',
      };
    }
  }
  if (existing && !existing.already_processed) {
    const payload = bodyAfterEnvelope(existing.body);
    if (type === 'RESPONSE') {
      return {
        ok: true,
        duplicate: true,
        retry: true,
        type,
        channel: 'response_worker',
        action: 'deliver',
        request_id: existing.request_id,
        message_id: existing.message_id,
        answer: payload,
        rule: RULE,
      };
    }
    return {
      ok: true,
      duplicate: true,
      retry: true,
      type,
      channel: 'request_worker',
      action: 'answer',
      request_id: existing.request_id,
      message_id: existing.message_id,
      request: payload,
      rule: RULE,
    };
  }
  return {
    ok: true,
    duplicate: true,
    action: 'ignore',
    type,
    channel: workerFor(type),
    reason: 'MESSAGE-ID or Gmail message ID already processed. Never respond twice.',
  };
}

async function validateIncomingMessage({ thisEndpoint, subject, body, gmailMessageId }) {
  const envelope = parseEnvelope(body);
  const type = classifyMessage({ subject, envelope });
  if (!type) {
    return { ok: false, action: 'ignore', reason: 'Not an A2A message' };
  }

  const channel = workerFor(type);
  const messageId = envelope.messageId || newId('msg');
  const requestId = envelope.requestId;
  const toEndpoint = envelope.toEndpoint || thisEndpoint;
  const fromEndpoint = envelope.fromEndpoint;

  if (toEndpoint && thisEndpoint && !sameId(toEndpoint, thisEndpoint)) {
    return {
      ok: false,
      action: 'ignore',
      channel,
      type,
      reason: 'TO-ENDPOINT is not this user’s endpoint',
    };
  }

  let stored;
  try {
    stored = await insertMessage({
      message_id: messageId,
      gmail_message_id: gmailMessageId || null,
      request_id: requestId || newId('req'),
      conversation_id: envelope.conversationId || newId('conv'),
      message_type: type,
      from_endpoint: fromEndpoint || thisEndpoint,
      to_endpoint: toEndpoint || thisEndpoint,
      in_reply_to: envelope.inReplyTo && envelope.inReplyTo !== 'none' ? envelope.inReplyTo : null,
      subject: String(subject || ''),
      body: String(body || ''),
      channel,
      already_processed: false,
    });
  } catch (error) {
    if (!error.duplicate) throw error;
    const existing = await getMessage({ messageId, gmailMessageId });
    return duplicateResult(existing, type);
  }

  const payload = bodyAfterEnvelope(body);

  if (type === 'RESPONSE') {
    if (!requestId) {
      return { ok: false, action: 'ignore', type, channel, reason: 'Missing REQUEST-ID' };
    }
    const pending = await getRequest(requestId);
    if (!pending) {
      return { ok: false, action: 'ignore', type, channel, reason: 'Unknown REQUEST-ID' };
    }
    if (!sameId(pending.originating_endpoint, thisEndpoint)) {
      return {
        ok: false,
        action: 'ignore',
        type,
        channel,
        reason: 'This endpoint did not create that request. Do not consume a response meant for another AI.',
      };
    }
    return {
      ok: true,
      type,
      channel: 'response_worker',
      action: 'deliver',
      request_id: requestId,
      message_id: stored.message_id,
      answer: payload,
      rule: RULE,
    };
  }

  if (!fromEndpoint) {
    return { ok: false, action: 'ignore', type, reason: 'Missing FROM-ENDPOINT' };
  }
  if (!requestId) {
    return { ok: false, action: 'ignore', type, reason: 'Missing REQUEST-ID' };
  }

  const existing = await getRequest(requestId);
  if (!existing) {
    await upsertRequest({
      request_id: requestId,
      conversation_id: envelope.conversationId || newId('conv'),
      originating_endpoint: fromEndpoint,
      target_endpoint: thisEndpoint,
      request: payload,
      answer: '',
      status: 'waiting',
    });
  } else if (!sameId(existing.target_endpoint, thisEndpoint)) {
    return {
      ok: false,
      action: 'ignore',
      type,
      channel: 'request_worker',
      reason: 'This REQUEST is not addressed to this endpoint',
    };
  }

  const current = existing || await getRequest(requestId);
  if (current && current.response_sent_at) {
    await markProcessed(stored.message_id);
    return {
      ok: true,
      duplicate: true,
      action: 'ignore',
      type,
      channel: 'request_worker',
      reason: 'This REQUEST was already answered. Never respond twice.',
    };
  }

  return {
    ok: true,
    type,
    channel: 'request_worker',
    action: 'answer',
    request_id: requestId,
    message_id: stored.message_id,
    request: payload,
    conversation_id: (current && current.conversation_id) || envelope.conversationId,
    rule: RULE,
  };
}

async function recordNetworkResponse({ thisEndpoint, requestId, answer, inboundMessageId }) {
  const request = await getRequest(requestId);
  if (!request) throw new Error('Unknown request_id');
  if (!sameId(request.originating_endpoint, thisEndpoint)) {
    throw new Error('This endpoint did not create that request. Do not consume a response meant for another AI.');
  }

  if (request.status === 'answered' && request.answer) {
    await markProcessed(inboundMessageId);
    return {
      request,
      duplicate: true,
      action: 'deliver',
      note: 'Already recorded. Never answer a RESPONSE automatically.',
    };
  }

  const saved = await upsertRequest({
    ...request,
    answer: String(answer || request.answer || '').trim(),
    status: 'answered',
    answered_at: new Date().toISOString(),
  });
  await markProcessed(inboundMessageId);

  return {
    request: saved,
    action: 'deliver',
    note: 'Notify the user that the requested answer arrived. Never answer a RESPONSE automatically.',
  };
}

async function getNetworkResults({ endpointId }) {
  requireDb();
  const { data: outgoing, error: outErr } = await supabase
    .from('airsup_network_requests')
    .select('*')
    .eq('originating_endpoint', endpointId)
    .order('created_at', { ascending: false });
  if (outErr) throw outErr;

  const { data: inbox, error: inErr } = await supabase
    .from('airsup_network_requests')
    .select('*')
    .eq('target_endpoint', endpointId)
    .is('response_sent_at', null)
    .order('created_at', { ascending: false });
  if (inErr) throw inErr;

  const rows = outgoing || [];
  return {
    waiting: rows.filter((row) => row.status === 'waiting'),
    answered: rows.filter((row) => row.status === 'answered'),
    inbox: inbox || [],
    rule: `${RULE} Call get_network_results from any later chat; do not wait in the original conversation.`,
  };
}

module.exports = {
  PROTOCOL_VERSION,
  RULE,
  parseEnvelope,
  classifyMessage,
  createNetworkRequest,
  createNetworkResponse,
  recordNetworkResponse,
  validateIncomingMessage,
  getNetworkResults,
};
