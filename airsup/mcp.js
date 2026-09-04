const { findPeople } = require('./match');
const { listActiveEndpoints, requireEndpoint } = require('./db');
const { MCP_PROTOCOL, MCP_URL } = require('./config');
const {
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

function endpointArg(description) {
  return { type: 'string', description };
}

function tokenArg() {
  return { type: 'string', description: 'Secret token from your Airsup first prompt. Always pass it with this_endpoint / requester_id.' };
}

function toolList() {
  return {
    tools: [
      {
        name: 'find_people',
        title: 'Find people',
        description:
          'Search listed Airsup people using their real public onboarding answers. Never invent people. Show matches and wait. Do not start_call in the same turn.',
        inputSchema: {
          type: 'object',
          properties: {
            requester_id: endpointArg('Your own endpoint_id'),
            token: tokenArg(),
            query: { type: 'string', description: 'A name like Anna, or what you need' },
            current_need: { type: 'string' },
            what_requester_can_offer: { type: 'string' },
            desired_person: { type: 'string' },
            maximum_results: { type: 'number' },
          },
          required: ['requester_id', 'token', 'query'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'start_call',
        title: 'Start call',
        description:
          'Open a live Airsup line. Returns one Gmail doorbell. Then session_sync in THIS chat. session_sync waits for the other side.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            token: tokenArg(),
            target_endpoint: endpointArg('The other person’s endpoint_id'),
            opening: { type: 'string', description: 'First message on the line' },
          },
          required: ['this_endpoint', 'token', 'target_endpoint'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'join_call',
        title: 'Join call',
        description: 'Pick up an incoming ring. Then session_sync. Never answer the doorbell email.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            token: tokenArg(),
            call_id: { type: 'string' },
          },
          required: ['this_endpoint', 'token', 'call_id'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'session_sync',
        title: 'Session sync',
        description:
          'Live talk. Waits up to 12s. If new_from_other has lines, say those to the user, then session_sync again. If MUST_CALL_AGAIN=true, call this again immediately without talking. Always pass since_seq (0 first, then next_since_seq).',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            token: tokenArg(),
            call_id: { type: 'string' },
            message: { type: 'string', description: 'Optional outbound chat' },
            since_seq: { type: 'number', description: 'Required. 0 the first time, then always next_since_seq.' },
          },
          required: ['this_endpoint', 'token', 'call_id', 'since_seq'],
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
            this_endpoint: endpointArg('Your endpoint_id'),
            token: tokenArg(),
            call_id: { type: 'string' },
          },
          required: ['this_endpoint', 'token', 'call_id'],
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
            this_endpoint: endpointArg('Your endpoint_id'),
            token: tokenArg(),
          },
          required: ['this_endpoint', 'token'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'handle_ring',
        title: 'Handle ring',
        description: 'Inbound Gmail. Only [A2A-RING] is acted on: this joins the call. Never answer the email.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            token: tokenArg(),
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['this_endpoint', 'token', 'subject'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
    ],
  };
}

async function callFindPeople(args) {
  await requireEndpoint(args.requester_id || args.this_endpoint, args.token);
  const rows = await listActiveEndpoints();
  return findPeople({
    requesterId: args.requester_id || args.this_endpoint,
    query: args.query,
    currentNeed: args.current_need,
    whatRequesterCanOffer: args.what_requester_can_offer,
    desiredPerson: args.desired_person,
    maximumResults: args.maximum_results,
    rows,
  });
}

function rpcErrorCode(error) {
  const code = Number(error && error.code);
  return Number.isInteger(code) ? code : -32603;
}

function formatToolResult(data) {
  const parts = [];
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
  if (name === 'find_people') return callFindPeople(a);
  if (name === 'start_call') {
    return startCall({
      thisEndpoint: a.this_endpoint || a.from_endpoint,
      token,
      targetEndpoint: a.target_endpoint,
      opening: a.opening || a.request,
    });
  }
  if (name === 'join_call') {
    return joinCall({ thisEndpoint: a.this_endpoint, token, callId: a.call_id });
  }
  if (name === 'session_sync') {
    return sessionSync({
      thisEndpoint: a.this_endpoint,
      token,
      callId: a.call_id,
      message: a.message,
      sinceSeq: a.since_seq,
      waitMs: a.wait_ms,
    });
  }
  if (name === 'hang_up') {
    return hangUp({ thisEndpoint: a.this_endpoint, token, callId: a.call_id });
  }
  if (name === 'list_calls' || name === 'get_network_results') {
    return listCalls({ thisEndpoint: a.this_endpoint || a.endpoint_id, token });
  }
  if (name === 'handle_ring' || name === 'validate_incoming_message') {
    return handleRing({
      thisEndpoint: a.this_endpoint,
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
      instruction: 'Use start_call and session_sync. Do not send Gmail for conversation.',
    };
  }
  const error = new Error(`Unknown tool: ${name}`);
  error.code = -32601;
  throw error;
}

async function dispatch(message) {
  const method = message && message.method;
  const params = (message && message.params) || {};

  if (method === 'initialize') {
    return {
      protocolVersion: MCP_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'airsup', version: '2.3.0' },
      instructions:
        `Airsup MCP ${MCP_URL}. Pass token from the Airsup first prompt on every tool. Gmail is only a doorbell. MUST_CALL_AGAIN=true → session_sync again with zero words. SPEECH → say those lines, then sync. Do not find_people until the user names someone. Do not start_call in the same turn as find_people. RING email → handle_ring. Never Reply. Never invent people.`,
    };
  }

  if (method === 'ping') return {};
  if (method === 'tools/list') return toolList();
  if (method === 'resources/list') return { resources: [] };
  if (method === 'prompts/list') return { prompts: [] };
  if (method === 'tools/call') {
    const data = await callTool(params.name, params.arguments || {});
    return formatToolResult(data);
  }

  const error = new Error(`Unknown method: ${method}`);
  error.code = -32601;
  throw error;
}

async function handleOne(message) {
  if (typeof message.method === 'string' && message.method.startsWith('notifications/')) {
    return { notify: true };
  }
  const result = await dispatch(message);
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
  try {
    if (Array.isArray(message)) {
      const replies = [];
      for (const item of message) {
        const out = await handleOne(item || {});
        if (!out.notify) replies.push(out);
      }
      res.set('MCP-Protocol-Version', MCP_PROTOCOL);
      return res.json(replies);
    }
    const out = await handleOne(message);
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
};
