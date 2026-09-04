const { findPeople } = require('./match');
const { listActiveEndpoints } = require('./db');
const {
  createNetworkRequest,
  createNetworkResponse,
  recordNetworkResponse,
  validateIncomingMessage,
  getNetworkResults,
} = require('./a2a');

const PROTOCOL = '2025-03-26';
const RULE = 'REQUESTS are answered. RESPONSES are delivered. RESPONSES are never automatically answered.';

function mcpCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Airsup-Key, Mcp-Session-Id, MCP-Protocol-Version');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
}

function toolList() {
  return {
    tools: [
      {
        name: 'find_people',
        title: 'Find people',
        description:
          'Search the Airsup AI endpoint directory. Loads every active, contactable, approved compact profile except the requester, compares them in one pass for reciprocal fit, and returns the best matches with evidence. Use this instead of guessing or hardcoding a person. Do not expect complete onboarding answers — only public match cards.',
        inputSchema: {
          type: 'object',
          properties: {
            requester_id: { type: 'string', description: 'The caller’s own endpoint_id, excluded from results' },
            current_need: { type: 'string', description: 'One concrete thing the requester needs help with' },
            what_requester_can_offer: { type: 'string', description: 'One valuable thing the requester can offer' },
            desired_person: { type: 'string', description: 'The type of person who would create a positive-sum connection' },
            maximum_results: { type: 'number', description: 'How many matches to return, default 3, max 5' },
          },
          required: ['requester_id', 'current_need'],
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
          destructiveHint: false,
        },
      },
      {
        name: 'create_network_request',
        title: 'Create network request',
        description:
          'Create a durable waiting request and a brand-new [A2A-REQUEST] email. Do not use Gmail Reply. The original chat will not stay open; later call get_network_results.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: { type: 'string', description: 'The caller’s own endpoint_id' },
            target_endpoint: { type: 'string', description: 'The other person’s endpoint_id' },
            request: { type: 'string', description: 'The request to send to their AI' },
            conversation_id: { type: 'string', description: 'Optional. Reuse to link a follow-up. Follow-ups still get a new request_id.' },
          },
          required: ['this_endpoint', 'target_endpoint', 'request'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'validate_incoming_message',
        title: 'Validate incoming message',
        description:
          'The network server decides whether an email is a REQUEST or a RESPONSE. Subject [A2A-RESPONSE] and envelope MESSAGE-TYPE: RESPONSE can never be auto-answered. Gmail labels are not enough.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: { type: 'string', description: 'The mailbox owner’s endpoint_id' },
            subject: { type: 'string' },
            body: { type: 'string' },
            gmail_message_id: { type: 'string', description: 'Gmail’s id for webhook idempotency' },
          },
          required: ['this_endpoint', 'subject', 'body'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'create_network_response',
        title: 'Create network response',
        description:
          'After answering a REQUEST, create a brand-new [A2A-RESPONSE] email. Never use Gmail Reply. Never call this for a RESPONSE.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: { type: 'string' },
            request_id: { type: 'string' },
            answer: { type: 'string' },
            inbound_message_id: { type: 'string', description: 'MESSAGE-ID of the REQUEST that was just answered' },
          },
          required: ['this_endpoint', 'request_id', 'answer'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'record_network_response',
        title: 'Record network response',
        description:
          'Attach an arrived [A2A-RESPONSE] to the durable waiting request (waiting → answered). Notify the user. Never answer a RESPONSE automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: { type: 'string', description: 'Must be the endpoint that created the original request' },
            request_id: { type: 'string' },
            answer: { type: 'string' },
            inbound_message_id: { type: 'string' },
          },
          required: ['this_endpoint', 'request_id', 'answer'],
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      {
        name: 'get_network_results',
        title: 'Get network results',
        description:
          'Read durable A2A state from any later conversation. waiting = requests this endpoint sent that are still unanswered. answered = replies that arrived. inbox = REQUESTS this endpoint still needs to answer. Never treat answered items as new questions.',
        inputSchema: {
          type: 'object',
          properties: {
            this_endpoint: { type: 'string' },
          },
          required: ['this_endpoint'],
        },
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
    ],
  };
}

async function callFindPeople(args) {
  const rows = await listActiveEndpoints();
  return findPeople({
    requesterId: args.requester_id,
    currentNeed: args.current_need,
    whatRequesterCanOffer: args.what_requester_can_offer,
    desiredPerson: args.desired_person,
    maximumResults: args.maximum_results,
    rows,
  });
}

async function callTool(name, args) {
  if (name === 'find_people') return callFindPeople(args);
  if (name === 'create_network_request') {
    return createNetworkRequest({
      fromEndpoint: args.this_endpoint || args.from_endpoint,
      targetEndpoint: args.target_endpoint,
      request: args.request,
      conversationId: args.conversation_id,
    });
  }
  if (name === 'validate_incoming_message') {
    return validateIncomingMessage({
      thisEndpoint: args.this_endpoint,
      subject: args.subject,
      body: args.body || args.message,
      gmailMessageId: args.gmail_message_id,
    });
  }
  if (name === 'create_network_response') {
    return createNetworkResponse({
      thisEndpoint: args.this_endpoint,
      requestId: args.request_id,
      answer: args.answer,
      inboundMessageId: args.inbound_message_id,
    });
  }
  if (name === 'record_network_response') {
    return recordNetworkResponse({
      thisEndpoint: args.this_endpoint,
      requestId: args.request_id,
      answer: args.answer,
      inboundMessageId: args.inbound_message_id,
    });
  }
  if (name === 'get_network_results') {
    return getNetworkResults({ endpointId: args.this_endpoint || args.endpoint_id });
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
      protocolVersion: PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'airsup', version: '1.1.0' },
      instructions:
        `${RULE} Call find_people to compare compact cards. To contact someone, create_network_request and send a new [A2A-REQUEST] email — never Gmail Reply. Incoming mail must go through validate_incoming_message. The original ChatGPT chat will not stay open; call get_network_results later. Never invent people. Never use intimate onboarding answers.`,
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'MCP uses POST (streamable HTTP JSON)' });
  }

  const message = req.body || {};
  if (typeof message.method === 'string' && message.method.startsWith('notifications/')) {
    return res.status(202).end();
  }

  try {
    const result = await dispatch(message);
    res.set('MCP-Protocol-Version', PROTOCOL);
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
