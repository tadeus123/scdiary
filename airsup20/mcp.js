const fs = require('fs');
const path = require('path');
const { MCP_PROTOCOL, MCP_URL, SERVER_NAME, SERVER_VERSION } = require('./config');
const { sha256 } = require('./util');
const { createServices } = require('./services');
const auth = require('./auth');

const TOOL_FILES = ['me', 'setup', 'update_listing', 'fulfill', 'get_inbox', 'get_trace'];

function loadTools() {
  return TOOL_FILES.map((name) => JSON.parse(
    fs.readFileSync(path.join(__dirname, 'tools', `${name}.json`), 'utf8'),
  ));
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

function formatToolResult(data) {
  const status = Array.isArray(data && data.status_labels) ? data.status_labels.join(' → ') : '';
  const answer = data && data.answer ? String(data.answer) : '';
  const parts = [];
  if (status) parts.push(`Status: ${status}`);
  if (answer) parts.push(answer);
  if (data && data.needs_setup) parts.push('Initial setup required.');
  if (data && data.inbox_unread) parts.push(`Inbox unread: ${data.inbox_unread}`);
  if (data && data.trace_id) parts.push(`trace_id ${data.trace_id}`);
  if (!parts.length) parts.push(JSON.stringify(data));
  return {
    structuredContent: data,
    content: [{ type: 'text', text: parts.join('\n') }],
  };
}

function resourceMetadataUrl(req) {
  return `${auth.getPublicOrigin(req)}/.well-known/oauth-protected-resource/airsup20/mcp`;
}

function unauthorized(req, res) {
  res.set('WWW-Authenticate', `Bearer realm="airsup20", resource_metadata="${resourceMetadataUrl(req)}"`);
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Airsup20 plugin OAuth required' },
  });
}

async function userFromRequest(req, store) {
  const token = extractBearer(req);
  if (!token) return null;
  const row = await store.getPluginToken(sha256(token));
  if (!row) return null;
  return store.getUser(row.user_id);
}

function createMcp({ store, fetchImpl } = {}) {
  const backing = store;
  const services = createServices({ store: backing, fetchImpl });
  const tools = loadTools();

  function toolList() {
    return { tools };
  }

  async function callTool(name, caller, args) {
    if (name === 'me') return services.getMe(caller);
    if (name === 'setup') return services.setup(caller, args || {});
    if (name === 'update_listing') return services.updateListing(caller, args || {});
    if (name === 'fulfill') return services.fulfill(caller, args || {});
    if (name === 'get_inbox') return services.getInbox(caller, args || {});
    if (name === 'get_trace') return services.getTrace(caller, args || {});
    const error = new Error(`Unknown tool: ${name}`);
    error.code = -32601;
    throw error;
  }

  async function dispatch(message, caller) {
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
          `Airsup20 ${MCP_URL}.`,
          'Identity is the plugin OAuth session (Google).',
          'No website dashboard. Listing and setup happen through these tools.',
          'Tools: me, setup, update_listing, fulfill, get_inbox, get_trace.',
          'On first use, call me; if needs_setup, ask setup_questions then call setup.',
          'For people goals use fulfill once — Airsup runs fast endpoint probes and internal endpoint talk; do not expect a chat widget.',
          'Show the user status_labels and the final answer, not raw AI↔AI packets.',
          'Mention inbox_unread when present. Use get_trace with trace_id to inspect timings.',
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
      if (!caller) {
        const error = new Error('Airsup20 plugin OAuth required');
        error.code = -32000;
        throw error;
      }
      const data = await callTool(params.name, caller, params.arguments || {});
      return formatToolResult(data);
    }
    const error = new Error(`Unknown method: ${method}`);
    error.code = -32601;
    throw error;
  }

  async function handleOne(message, caller) {
    if (typeof message.method === 'string' && message.method.startsWith('notifications/')) {
      return { notify: true };
    }
    const result = await dispatch(message, caller);
    return { jsonrpc: '2.0', id: message.id ?? null, result };
  }

  async function handleMcp(req, res) {
    mcpCors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method === 'GET' && !req.body) return unauthorized(req, res);
    if (req.method !== 'POST') {
      return res.status(405).json({ jsonrpc: '2.0', error: { code: -32600, message: 'MCP uses POST' } });
    }
    const message = req.body || {};
    const method = message && message.method;
    const caller = await userFromRequest(req, backing);
    const publicMethod =
      method === 'initialize'
      || method === 'ping'
      || method === 'tools/list'
      || method === 'resources/list'
      || method === 'prompts/list'
      || (typeof method === 'string' && method.startsWith('notifications/'));
    if (!caller && !publicMethod) return unauthorized(req, res);
    try {
      if (Array.isArray(message)) {
        const replies = [];
        for (const item of message) {
          const out = await handleOne(item || {}, caller);
          if (!out.notify) replies.push(out);
        }
        res.set('MCP-Protocol-Version', MCP_PROTOCOL);
        return res.json(replies);
      }
      const out = await handleOne(message, caller);
      if (out.notify) return res.status(202).end();
      res.set('MCP-Protocol-Version', MCP_PROTOCOL);
      return res.json(out);
    } catch (error) {
      console.error('Airsup20 MCP error:', error);
      res.status(200).json({
        jsonrpc: '2.0',
        id: message && message.id != null ? message.id : null,
        error: { code: error.code || -32603, message: error.message || 'Internal error' },
      });
    }
  }

  return { handleMcp, callTool, toolList, formatToolResult, services };
}

module.exports = { createMcp, loadTools };
