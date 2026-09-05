const { findPeople } = require('./match');
const { listActiveEndpoints, requireEndpoint } = require('./db');
const { MCP_PROTOCOL, MCP_URL } = require('./config');
const {
  prepareCall,
  confirmCall,
  startCall,
  joinCall,
  sessionSync,
  hangUp,
  listCalls,
  handleRing,
} = require('./call');

function mcpCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Airsup-Key, Mcp-Session-Id, MCP-Protocol-Version');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
}

function tokenArg() {
  return { type: 'string', description: 'Your Airsup token from the first prompt.' };
}

function lineTokenArg() {
  return { type: 'string', description: 'line_token from handle_ring. Use this instead of token on the doorbell worker.' };
}

function optionalMe() {
  return { type: 'string', description: 'Optional. Your own endpoint_id if the token is not enough.' };
}

function toolList() {
  return {
    tools: [
      {
        name: 'find_people',
        title: 'Find people',
        description:
          'Search listed Airsup people from their public listing answers. Returns match_id values only. Show matches and wait. Do not prepare_call in the same turn.',
        inputSchema: {
          type: 'object',
          properties: {
            token: tokenArg(),
            query: { type: 'string', description: 'A name like Anna, or what you need' },
            requester_id: optionalMe(),
            current_need: { type: 'string' },
            what_requester_can_offer: { type: 'string' },
            desired_person: { type: 'string' },
            maximum_results: { type: 'number' },
          },
          required: ['token', 'query'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'prepare_call',
        title: 'Prepare call',
        description:
          'Draft a call from a find_people match_id. Does not ring anyone. Returns confirmation_id.',
        inputSchema: {
          type: 'object',
          properties: {
            token: tokenArg(),
            match_id: { type: 'string', description: 'match_id from find_people' },
            opening: { type: 'string', description: 'First message on the line' },
            this_endpoint: optionalMe(),
          },
          required: ['token', 'match_id'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'confirm_call',
        title: 'Confirm call',
        description: 'Complete a prepared Airsup call. Pass only confirmation_id from prepare_call.',
        inputSchema: {
          type: 'object',
          properties: {
            token: tokenArg(),
            confirmation_id: { type: 'string', description: 'confirmation_id from prepare_call' },
            this_endpoint: optionalMe(),
          },
          required: ['token', 'confirmation_id'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'join_call',
        title: 'Join call',
        description: 'Pick up an incoming ring. Then session_sync. Never answer the doorbell email. Doorbell workers should use handle_ring, not this.',
        inputSchema: {
          type: 'object',
          properties: {
            token: tokenArg(),
            call_id: { type: 'string' },
            this_endpoint: optionalMe(),
          },
          required: ['token', 'call_id'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'session_sync',
        title: 'Session sync',
        description:
          'Live talk. Waits up to 12s. If new_from_other has lines, say those to the user, then session_sync again. If MUST_CALL_AGAIN=true, call this again immediately without talking. Always pass since_seq (0 first, then next_since_seq). Doorbell workers pass line_token from handle_ring instead of token.',
        inputSchema: {
          type: 'object',
          properties: {
            token: tokenArg(),
            line_token: lineTokenArg(),
            call_id: { type: 'string' },
            message: { type: 'string', description: 'Optional outbound chat' },
            since_seq: { type: 'number', description: 'Required. 0 the first time, then always next_since_seq.' },
            this_endpoint: optionalMe(),
          },
          required: ['call_id', 'since_seq'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'hang_up',
        title: 'Hang up',
        description: 'Leave the line. Closes when both sides hang up, or if you cancel your own unanswered ring.',
        inputSchema: {
          type: 'object',
          properties: {
            token: tokenArg(),
            line_token: lineTokenArg(),
            call_id: { type: 'string' },
            this_endpoint: optionalMe(),
          },
          required: ['call_id'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'list_calls',
        title: 'List calls',
        description: 'Incoming rings and live lines. Source of truth if Gmail is late.',
        inputSchema: {
          type: 'object',
          properties: {
            token: tokenArg(),
            this_endpoint: optionalMe(),
          },
          required: ['token'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'handle_ring',
        title: 'Handle ring',
        description: 'Inbound Gmail. Only [A2A-RING] is acted on: this joins the call. Pass subject and body. Token is not required. Never answer the email.',
        inputSchema: {
          type: 'object',
          properties: {
            token: tokenArg(),
            subject: { type: 'string' },
            body: { type: 'string' },
            this_endpoint: optionalMe(),
          },
          required: ['subject', 'body'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
    ],
  };
}

function extractHeaderToken(req) {
  if (!req) return '';
  const header = String((req.get && req.get('authorization')) || (req.headers && req.headers.authorization) || '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return String((req.get && req.get('x-airsup-key')) || (req.headers && req.headers['x-airsup-key']) || '').trim();
}

function withAuth(args, headerToken) {
  const a = { ...(args || {}) };
  if (!String(a.token || '').trim() && headerToken) a.token = headerToken;
  return a;
}

async function callFindPeople(args) {
  const me = await requireEndpoint(args.requester_id || args.this_endpoint, args.token);
  const rows = await listActiveEndpoints();
  return findPeople({
    requesterId: me.endpoint_id,
    query: args.query,
    currentNeed: args.current_need,
    whatRequesterCanOffer: args.what_requester_can_offer,
    desiredPerson: args.desired_person,
    maximumResults: args.maximum_results,
    rows,
  });
}

function rejectTargetEndpoint(args) {
  if (String((args && args.target_endpoint) || '').trim()) {
    const error = new Error('Pass match_id from find_people. Do not pass a target endpoint.');
    error.code = -32602;
    throw error;
  }
}

function rpcErrorCode(error) {
  const code = Number(error && error.code);
  return Number.isInteger(code) ? code : -32603;
}

function formatToolResult(data) {
  const parts = [];
  if (data && typeof data === 'object' && data.line_token) {
    parts.push(`LINE_TOKEN=${data.line_token}`);
  }
  if (data && typeof data === 'object' && data.must_confirm && data.confirmation_id) {
    parts.push(`MUST_CONFIRM=true confirmation_id=${data.confirmation_id}`);
    if (data.instruction) parts.push(data.instruction);
  }
  if (data && typeof data === 'object' && typeof data.must_call_again === 'boolean') {
    const count = Array.isArray(data.new_from_other) ? data.new_from_other.length : 0;
    parts.push(`MUST_CALL_AGAIN=${data.must_call_again} next_since_seq=${data.next_since_seq} new_from_other=${count}`);
    if (data.instruction) parts.push(data.instruction);
    if (count > 0) {
      parts.push('SPEECH:');
      for (const row of data.new_from_other) {
        parts.push(String(row.body || ''));
      }
    }
  }
  parts.push(JSON.stringify(data));
  return {
    structuredContent: data,
    content: [{ type: 'text', text: parts.join('\n') }],
  };
}

async function callTool(name, args) {
  const a = args || {};
  const token = a.token;
  const me = a.this_endpoint || a.requester_id || a.from_endpoint;
  if (name === 'find_people') return callFindPeople(a);
  if (name === 'prepare_call') {
    rejectTargetEndpoint(a);
    return prepareCall({
      thisEndpoint: me,
      token,
      matchId: a.match_id,
      opening: a.opening || a.request,
    });
  }
  if (name === 'confirm_call') {
    rejectTargetEndpoint(a);
    return confirmCall({
      thisEndpoint: me,
      token,
      confirmationId: a.confirmation_id,
    });
  }
  if (name === 'start_call') {
    rejectTargetEndpoint(a);
    if (a.confirmation_id) {
      return confirmCall({
        thisEndpoint: me,
        token,
        confirmationId: a.confirmation_id,
      });
    }
    const prepared = await prepareCall({
      thisEndpoint: me,
      token,
      matchId: a.match_id,
      opening: a.opening || a.request,
    });
    return confirmCall({
      thisEndpoint: me,
      token,
      confirmationId: prepared.confirmation_id,
    });
  }
  if (name === 'join_call') {
    return joinCall({ thisEndpoint: me, token, lineToken: a.line_token, callId: a.call_id });
  }
  if (name === 'session_sync') {
    return sessionSync({
      thisEndpoint: me,
      token,
      lineToken: a.line_token,
      callId: a.call_id,
      message: a.message,
      sinceSeq: a.since_seq,
      waitMs: a.wait_ms,
    });
  }
  if (name === 'hang_up') {
    return hangUp({ thisEndpoint: me, token, lineToken: a.line_token, callId: a.call_id });
  }
  if (name === 'list_calls' || name === 'get_network_results') {
    return listCalls({ thisEndpoint: me || a.endpoint_id, token });
  }
  if (name === 'handle_ring' || name === 'validate_incoming_message') {
    return handleRing({
      thisEndpoint: me,
      token,
      subject: a.subject,
      body: a.body || a.message,
    });
  }
  if (
    name === 'create_network_request'
    || name === 'create_network_response'
    || name === 'record_network_response'
  ) {
    return {
      ok: false,
      action: 'ignore',
      instruction: 'Use prepare_call, confirm_call, and session_sync. Do not send Gmail for conversation.',
    };
  }
  const error = new Error(`Unknown tool: ${name}`);
  error.code = -32601;
  throw error;
}

async function dispatch(message, headerToken) {
  const method = message && message.method;
  const params = (message && message.params) || {};

  if (method === 'initialize') {
    return {
      protocolVersion: MCP_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'airsup', version: '2.5.0' },
      instructions:
        `Airsup MCP ${MCP_URL}. Auth is your token, or a line_token from handle_ring. Never pass another person’s endpoint. Gmail is only a doorbell. MUST_CONFIRM=true → confirm_call immediately with zero words. MUST_CALL_AGAIN=true → session_sync again with zero words. SPEECH → say those lines, then sync. RING email → handle_ring with subject and body, then session_sync with LINE_TOKEN. Never Reply. Never invent people.`,
    };
  }

  if (method === 'ping') return {};
  if (method === 'tools/list') return toolList();
  if (method === 'resources/list') return { resources: [] };
  if (method === 'prompts/list') return { prompts: [] };
  if (method === 'tools/call') {
    const data = await callTool(params.name, withAuth(params.arguments || {}, headerToken));
    return formatToolResult(data);
  }

  const error = new Error(`Unknown method: ${method}`);
  error.code = -32601;
  throw error;
}

async function handleOne(message, headerToken) {
  if (typeof message.method === 'string' && message.method.startsWith('notifications/')) {
    return { notify: true };
  }
  const result = await dispatch(message, headerToken);
  return { jsonrpc: '2.0', id: message.id ?? null, result };
}

async function handleMcp(req, res) {
  mcpCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method === 'GET') {
    return res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Airsup MCP is streamable HTTP. POST JSON-RPC to this URL.' },
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ jsonrpc: '2.0', error: { code: -32600, message: 'MCP uses POST' } });
  }

  const message = req.body || {};
  const headerToken = extractHeaderToken(req);
  try {
    if (Array.isArray(message)) {
      const replies = [];
      for (const item of message) {
        const out = await handleOne(item || {}, headerToken);
        if (!out.notify) replies.push(out);
      }
      res.set('MCP-Protocol-Version', MCP_PROTOCOL);
      return res.json(replies);
    }
    const out = await handleOne(message, headerToken);
    if (out.notify) return res.status(202).end();
    res.set('MCP-Protocol-Version', MCP_PROTOCOL);
    return res.json(out);
  } catch (error) {
    console.error('Airsup MCP error:', error);
    res.status(200).json({
      jsonrpc: '2.0',
      id: message && message.id != null ? message.id : null,
      error: {
        code: rpcErrorCode(error),
        message: error.message || 'Internal error',
      },
    });
  }
}

module.exports = {
  handleMcp,
  callFindPeople,
  callTool,
  toolList,
  formatToolResult,
  mcpCors,
  extractHeaderToken,
  withAuth,
};
