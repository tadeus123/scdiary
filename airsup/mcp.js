const { findPeople } = require('./match');
const { listActiveEndpoints } = require('./db');
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

function toolList() {
  return {
    tools: [
      {
        name: 'find_people',
        title: 'Find people',
        description:
          'Search listed Airsup people using their real public onboarding answers (vector + name). Never invent people. Intimate answers are not in the index. Then start_call to talk.',
        inputSchema: {
          type: 'object',
          properties: {
            requester_id: endpointArg('Your own endpoint_id, excluded from results'),
            query: { type: 'string', description: 'Free text, a name like “Anna”, or what you need' },
            current_need: { type: 'string' },
            what_requester_can_offer: { type: 'string' },
            desired_person: { type: 'string' },
            maximum_results: { type: 'number' },
          },
          required: ['requester_id'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'start_call',
        title: 'Start call',
        description:
          'Open a live Airsup line to another endpoint. Returns a Gmail doorbell to wake them. After sending that one email, stay in this chat and call session_sync. Do not wait for a Gmail reply.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            target_endpoint: endpointArg('The other person’s endpoint_id'),
            opening: { type: 'string', description: 'First message waiting on the line when they pick up' },
          },
          required: ['this_endpoint', 'target_endpoint'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'join_call',
        title: 'Join call',
        description: 'Pick up an incoming Airsup ring. Then session_sync in this same chat. Never answer the doorbell email.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            call_id: { type: 'string' },
          },
          required: ['this_endpoint', 'call_id'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'session_sync',
        title: 'Session sync',
        description:
          'Live talk. Send an optional message and receive everything new on this call. Keep calling this until hang_up. This is the conversation. Gmail is not.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            call_id: { type: 'string' },
            message: { type: 'string', description: 'Optional outbound chat to the other AI' },
            since_seq: { type: 'number', description: 'Last seq you already saw. Default 0.' },
          },
          required: ['this_endpoint', 'call_id'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'hang_up',
        title: 'Hang up',
        description: 'Leave the line. The call stays until the other side also hangs up, unless you cancel a ring you started.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            call_id: { type: 'string' },
          },
          required: ['this_endpoint', 'call_id'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'list_calls',
        title: 'List calls',
        description: 'Incoming rings, outgoing rings, and live lines for this endpoint. Source of truth even if Gmail never arrived.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
          },
          required: ['this_endpoint'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'handle_ring',
        title: 'Handle ring',
        description: 'Classify inbound Gmail. Only [A2A-RING] doorbells are acted on, and the action is join_call — never answer the email.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: endpointArg('Your endpoint_id'),
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['this_endpoint', 'subject'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'create_network_request',
        title: 'Deprecated: use start_call',
        description: 'Deprecated alias. Opens a live call instead of a waiting email request.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: { type: 'string' },
            target_endpoint: { type: 'string' },
            request: { type: 'string' },
            conversation_id: { type: 'string' },
          },
          required: ['this_endpoint', 'target_endpoint', 'request'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'validate_incoming_message',
        title: 'Deprecated: use handle_ring',
        description: 'Deprecated alias. Rings become join_call. Old REQUEST/RESPONSE mail is ignored so channels cannot mix.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            gmail_message_id: { type: 'string' },
          },
          required: ['this_endpoint', 'subject', 'body'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'create_network_response',
        title: 'Deprecated: use session_sync',
        description: 'Deprecated. Live answers go through session_sync, not a second email channel.',
        inputSchema: { type: 'object', properties: { this_endpoint: { type: 'string' }, request_id: { type: 'string' }, answer: { type: 'string' } } },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'record_network_response',
        title: 'Deprecated: use session_sync',
        description: 'Deprecated. Live answers go through session_sync.',
        inputSchema: { type: 'object', properties: { this_endpoint: { type: 'string' }, request_id: { type: 'string' }, answer: { type: 'string' } } },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'get_network_results',
        title: 'Deprecated: use list_calls',
        description: 'Deprecated alias for list_calls.',
        inputSchema: { type: 'object', properties: { this_endpoint: { type: 'string' } }, required: ['this_endpoint'] },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
    ],
  };
}

async function callFindPeople(args) {
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

function deprecatedTalk() {
  return {
    deprecated: true,
    action: 'use_session_sync',
    instruction: 'Do not send REQUEST/RESPONSE email. Use start_call, join_call, and session_sync. Gmail is only the doorbell.',
  };
}

async function callTool(name, args) {
  const a = args || {};
  if (name === 'find_people') return callFindPeople(a);
  if (name === 'start_call') {
    return startCall({
      thisEndpoint: a.this_endpoint,
      targetEndpoint: a.target_endpoint,
      opening: a.opening || a.request,
    });
  }
  if (name === 'join_call') {
    return joinCall({ thisEndpoint: a.this_endpoint, callId: a.call_id });
  }
  if (name === 'session_sync') {
    return sessionSync({
      thisEndpoint: a.this_endpoint,
      callId: a.call_id,
      message: a.message,
      sinceSeq: a.since_seq,
    });
  }
  if (name === 'hang_up') {
    return hangUp({ thisEndpoint: a.this_endpoint, callId: a.call_id });
  }
  if (name === 'list_calls' || name === 'get_network_results') {
    return listCalls({ thisEndpoint: a.this_endpoint || a.endpoint_id });
  }
  if (name === 'handle_ring') {
    return handleRing({ thisEndpoint: a.this_endpoint, subject: a.subject, body: a.body });
  }
  if (name === 'create_network_request') {
    const started = await startCall({
      thisEndpoint: a.this_endpoint || a.from_endpoint,
      targetEndpoint: a.target_endpoint,
      opening: a.request,
    });
    return { ...started, deprecated: true, note: 'create_network_request now starts a live call. Use session_sync after the doorbell.' };
  }
  if (name === 'validate_incoming_message') {
    const ring = await handleRing({ thisEndpoint: a.this_endpoint, subject: a.subject, body: a.body || a.message });
    if (ring && ring.ok) return ring;
    return {
      ok: false,
      action: 'ignore',
      reason: 'Not an Airsup doorbell. Do not answer REQUEST/RESPONSE email. Use list_calls and session_sync.',
    };
  }
  if (name === 'create_network_response' || name === 'record_network_response') {
    return deprecatedTalk();
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
      serverInfo: { name: 'airsup', version: '2.0.0' },
      instructions:
        `Airsup MCP ${MCP_URL}. Gmail is only a doorbell. Live talk: find_people → start_call → send the [A2A-RING] email → session_sync in the same chat until hang_up. Incoming [A2A-RING]: handle_ring or join_call, never answer the email. Never invent people. Never use intimate onboarding answers.`,
    };
  }

  if (method === 'ping') return {};
  if (method === 'tools/list') return toolList();
  if (method === 'tools/call') {
    const data = await callTool(params.name, params.arguments || {});
    return {
      structuredContent: data,
      content: [{ type: 'text', text: JSON.stringify(data) }],
    };
  }

  const error = new Error(`Unknown method: ${method}`);
  error.code = -32601;
  throw error;
}

async function handleMcp(req, res) {
  mcpCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method === 'GET') {
    return res.json({
      name: 'airsup',
      url: MCP_URL,
      transport: 'streamable HTTP JSON-RPC POST',
      note: 'POST JSON-RPC to this URL. Gmail is a doorbell. Live talk is session_sync.',
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'MCP uses POST (streamable HTTP JSON)' });
  }

  const message = req.body || {};
  if (typeof message.method === 'string' && message.method.startsWith('notifications/')) {
    return res.status(202).end();
  }

  try {
    const result = await dispatch(message);
    res.set('MCP-Protocol-Version', MCP_PROTOCOL);
    res.json({ jsonrpc: '2.0', id: message.id ?? null, result });
  } catch (error) {
    console.error('Airsup MCP error:', error);
    res.status(200).json({
      jsonrpc: '2.0',
      id: message.id ?? null,
      error: {
        code: error.code || -32603,
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
  mcpCors,
};
