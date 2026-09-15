const fs = require('fs');
const path = require('path');
const { MCP_PROTOCOL, MCP_URL, SERVER_NAME, SERVER_VERSION, mcpSecret } = require('./config');
const { callTool, timingSafeEqualString } = require('./services');

const TOOL_FILES = [
  'lookup_supplier',
  'create_supplier_draft',
  'get_supplier_card',
  'update_supplier_card',
  'create_magic_link',
  'get_onboarding_status',
  'verify_supplier',
  'publish_supplier',
  'test_supplier_discovery',
  'generate_demo',
  'get_growth_funnel',
  'get_supplier_events',
];

const TOOL_STATUS = {
  lookup_supplier: { invoking: 'Looking up supplier', invoked: 'Supplier lookup ready' },
  create_supplier_draft: { invoking: 'Creating supplier draft', invoked: 'Draft ready' },
  get_supplier_card: { invoking: 'Loading supplier card', invoked: 'Card ready' },
  update_supplier_card: { invoking: 'Updating supplier card', invoked: 'Card updated' },
  create_magic_link: { invoking: 'Creating magic link', invoked: 'Magic link ready' },
  get_onboarding_status: { invoking: 'Checking onboarding', invoked: 'Status ready' },
  verify_supplier: { invoking: 'Verifying supplier', invoked: 'Verification done' },
  publish_supplier: { invoking: 'Publishing supplier', invoked: 'Publish done' },
  test_supplier_discovery: { invoking: 'Testing discovery', invoked: 'Discovery tested' },
  generate_demo: { invoking: 'Generating demo', invoked: 'Demo ready' },
  get_growth_funnel: { invoking: 'Loading growth funnel', invoked: 'Funnel ready' },
  get_supplier_events: { invoking: 'Loading supplier events', invoked: 'Events ready' },
};

function loadTools() {
  return TOOL_FILES.map((name) => {
    const tool = JSON.parse(fs.readFileSync(path.join(__dirname, 'tools', `${name}.json`), 'utf8'));
    const status = TOOL_STATUS[name];
    if (status) {
      tool._meta = {
        ...(tool._meta || {}),
        'openai/toolInvocation/invoking': status.invoking,
        'openai/toolInvocation/invoked': status.invoked,
      };
    }
    return tool;
  });
}

function mcpCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate');
}

function extractBearer(req) {
  const header = String((req.get && req.get('authorization')) || (req.headers && req.headers.authorization) || '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return '';
}

function authorized(req) {
  const secret = mcpSecret();
  if (!secret) return false;
  const token = extractBearer(req);
  if (!token) return false;
  return timingSafeEqualString(token, secret);
}

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Bearer realm="airsupdev"');
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Airsupdev bearer token required (AIRSUPDEV_MCP_SECRET)' },
  });
}

function formatToolResult(data) {
  return {
    structuredContent: data,
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

function createMcp() {
  const tools = loadTools();

  function toolList() {
    return { tools };
  }

  async function dispatch(message, authed) {
    const method = message && message.method;
    const params = (message && message.params) || {};
    if (method === 'initialize') {
      return {
        protocolVersion: MCP_PROTOCOL,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
        },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: [
          `Airsupdev ops MCP at ${MCP_URL}.`,
          'Auth: Authorization Bearer AIRSUPDEV_MCP_SECRET.',
          'China factory ops only. Prefer create_magic_link after lookup_supplier.',
          'Do not use for buyer ChatGPT discovery; that is /airsup/mcp.',
          'Verification methods: manual, email_link, site_listed (dns not built).',
        ].join(' '),
      };
    }
    if (method === 'ping') return {};
    if (method === 'tools/list') return toolList();
    if (method === 'resources/list') return { resources: [] };
    if (method === 'resources/read') {
      const error = new Error('No resources');
      error.code = -32002;
      throw error;
    }
    if (method === 'prompts/list') return { prompts: [] };
    if (method === 'tools/call') {
      if (!authed) {
        const error = new Error('Airsupdev bearer token required');
        error.code = -32000;
        throw error;
      }
      const data = await callTool(params.name, params.arguments || {});
      return formatToolResult(data);
    }
    const error = new Error(`Unknown method: ${method}`);
    error.code = -32601;
    throw error;
  }

  async function handleOne(message, authed) {
    if (typeof message.method === 'string' && message.method.startsWith('notifications/')) {
      return { notify: true };
    }
    const result = await dispatch(message, authed);
    return { jsonrpc: '2.0', id: message.id ?? null, result };
  }

  async function handleMcp(req, res) {
    mcpCors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method === 'GET') return unauthorized(res);
    if (req.method !== 'POST') {
      return res.status(405).json({ jsonrpc: '2.0', error: { code: -32600, message: 'MCP uses POST' } });
    }
    const message = req.body || {};
    const method = message && message.method;
    const authed = authorized(req);
    const publicMethod =
      method === 'initialize'
      || method === 'ping'
      || method === 'tools/list'
      || method === 'resources/list'
      || method === 'prompts/list'
      || (typeof method === 'string' && method.startsWith('notifications/'));
    if (!authed && !publicMethod) return unauthorized(res);
    try {
      if (Array.isArray(message)) {
        const replies = [];
        for (const item of message) {
          const out = await handleOne(item || {}, authed);
          if (!out.notify) replies.push(out);
        }
        res.set('MCP-Protocol-Version', MCP_PROTOCOL);
        return res.json(replies);
      }
      const out = await handleOne(message, authed);
      if (out.notify) return res.status(202).end();
      res.set('MCP-Protocol-Version', MCP_PROTOCOL);
      return res.json(out);
    } catch (error) {
      console.error('Airsupdev MCP error:', error);
      res.status(200).json({
        jsonrpc: '2.0',
        id: message && message.id != null ? message.id : null,
        error: { code: error.code || -32603, message: error.message || 'Internal error' },
      });
    }
  }

  return { handleMcp, toolList, TOOL_FILES };
}

module.exports = { createMcp };
