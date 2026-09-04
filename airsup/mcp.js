const { findPeople } = require('./match');
const { listActiveEndpoints } = require('./db');

const PROTOCOL = '2025-03-26';

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

async function dispatch(message) {
  const method = message && message.method;
  const params = (message && message.params) || {};

  if (method === 'initialize') {
    return {
      protocolVersion: PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'airsup', version: '1.0.0' },
      instructions:
        'Airsup directory. Call find_people to compare the requester against every approved compact card. Rank for complementarity, not similarity. Never invent people. Never use intimate onboarding answers; they are not in this directory.',
    };
  }

  if (method === 'ping') return {};
  if (method === 'tools/list') return toolList();
  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    if (name !== 'find_people') {
      const error = new Error(`Unknown tool: ${name}`);
      error.code = -32601;
      throw error;
    }
    const data = await callFindPeople(args);
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
  mcpCors,
};
