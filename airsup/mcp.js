const fs = require('fs');
const path = require('path');
const { MCP_PROTOCOL, MCP_URL } = require('./config');
const { findPeople } = require('./find-people');
const { createConversations } = require('./conversations');
const { createMailer } = require('./mail');
const db = require('./db');
const { sha256 } = require('./store-memory');
const { widgetResource, widgetContents, withConversationWidget, WIDGET_URI, shouldMountConversationWidget } = require('./widget');
const {
  conversationPanel,
  conversationResourceContents,
  isPublicResource,
} = require('./panel');

const findPeopleTool = JSON.parse(fs.readFileSync(path.join(__dirname, 'tools/find_people.json'), 'utf8'));
const sendMessageTool = JSON.parse(fs.readFileSync(path.join(__dirname, 'tools/send_message.json'), 'utf8'));
const endConversationTool = JSON.parse(fs.readFileSync(path.join(__dirname, 'tools/end_conversation.json'), 'utf8'));

function toolList() {
  return {
    tools: [
      findPeopleTool,
      withConversationWidget(sendMessageTool),
      withConversationWidget(endConversationTool),
    ],
  };
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

function publicToolData(data) {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  delete out._panel;
  return out;
}

function toolNarration(data) {
  const clean = publicToolData(data) || {};
  const id = String(clean.conversation_id || '').trim();
  if (clean.status === 'ended') {
    return id ? `Airsup conversation ended. conversation_id ${id}.` : 'Airsup conversation ended.';
  }
  if (clean.status === 'failed') {
    return id
      ? `Airsup could not complete that message. conversation_id ${id}.`
      : 'Airsup could not complete that message.';
  }
  if (id) return `Airsup replied in the conversation widget. conversation_id ${id}. Use that id for the next send_message.`;
  return 'Airsup replied in the conversation widget.';
}

function formatToolResult(data) {
  const clean = publicToolData(data);
  const text = clean && typeof clean === 'object' && (clean.status || clean.conversation_id)
    ? toolNarration(clean)
    : JSON.stringify(clean);
  return {
    structuredContent: clean,
    content: [{ type: 'text', text }],
  };
}

function withReply(panel, data, caller) {
  const next = panel && typeof panel === 'object'
    ? { ...panel, messages: Array.isArray(panel.messages) ? panel.messages.slice() : [] }
    : {
      conversation_id: (data && data.conversation_id) || '',
      status: (data && data.status) || '',
      you: { person_id: (caller && caller.person_id) || '', name: (caller && (caller.display_name || caller.email)) || 'You' },
      other: { person_id: '', name: 'Airsup' },
      messages: [],
      threads: [],
    };
  if (data && data.conversation_id) next.conversation_id = data.conversation_id;
  if (data && data.status) next.status = data.status;
  const reply = data && data.reply != null ? String(data.reply) : '';
  if (reply && !next.messages.some((row) => row.from === 'them' && row.body === reply)) {
    next.messages.push({
      from: 'them',
      name: (next.other && next.other.name) || 'Airsup',
      body: reply,
    });
  }
  return next;
}

async function formatWidgetResult(store, caller, data, opts) {
  const result = formatToolResult(data);
  if (!caller || !data) return result;
  const conversationId = String(data.conversation_id || '');
  const hasReply = data.reply != null && String(data.reply).trim();
  if (!conversationId && !hasReply && data.status !== 'ended' && data.status !== 'failed') return result;
  let panel = data._panel || null;
  if (!panel && conversationId.startsWith('cn_')) {
    try {
      const chinaTalk = require('./china/talk');
      panel = await chinaTalk.conversationPanel(caller, conversationId);
    } catch (error) {
      console.error('Airsup china panel skipped:', error.message);
    }
  }
  if (!panel && conversationId && !conversationId.startsWith('cn_')) {
    panel = await conversationPanel(store, caller.person_id, conversationId, { includeThreads: false });
    try {
      const chinaTalk = require('./china/talk');
      panel = await chinaTalk.mergePanel(caller, conversationId, panel);
    } catch (error) {
      console.error('Airsup china panel skipped:', error.message);
    }
  }
  result._meta = { ui: { panel: withReply(panel, data, caller) } };
  if (shouldMountConversationWidget(opts)) {
    result._meta.ui.resourceUri = WIDGET_URI;
    result._meta['openai/outputTemplate'] = WIDGET_URI;
    result._meta['openai/widgetAccessible'] = true;
    result._meta['openai/resultCanProduceWidget'] = true;
  } else {
    result._meta['openai/resultCanProduceWidget'] = false;
  }
  return result;
}

function resourceMetadataUrl(req) {
  const origin = publicOrigin(req);
  return `${origin}/.well-known/oauth-protected-resource/airsup/mcp`;
}

function publicOrigin(req) {
  const fromEnv = process.env.AIRSUP_PUBLIC_ORIGIN;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}`;
}

function unauthorized(req, res) {
  res.set('WWW-Authenticate', `Bearer realm="airsup", resource_metadata="${resourceMetadataUrl(req)}"`);
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Airsup plugin OAuth required' },
  });
}

async function personFromRequest(req, store) {
  const token = extractBearer(req);
  if (!token) return null;
  const row = await store.getPluginToken(sha256(token));
  if (!row) return null;
  return store.getPerson(row.person_id);
}

function createMcp({ store, mailer, sleep } = {}) {
  const backing = store || db;
  const sendMail = mailer || createMailer({ store: backing, decryptSecret: db.decryptSecret });
  const conversations = createConversations({ store: backing, mailer: sendMail, sleep });

  async function callTool(name, caller, args) {
    if (name === 'find_people') {
      return findPeople(backing, {
        callerPersonId: caller.person_id,
        query: args && args.query,
        maximumResults: args && args.maximum_results,
      });
    }
    if (name === 'send_message') {
      // AIRSUP-CHINA-BEGIN
      try {
        const chinaTalk = require('./china/talk');
        const handled = await chinaTalk.maybeHandle(caller, args);
        if (handled) return handled;
      } catch (error) {
        console.error('Airsup china talk skipped:', error.message);
        const conversationId = String((args && args.conversation_id) || '');
        const personId = String((args && args.person_id) || '');
        let company = false;
        try {
          company = await require('./china/talk').isCompanyId(personId);
        } catch {
          company = false;
        }
        if (conversationId.startsWith('cn_') || company) {
          return { conversation_id: conversationId || '', status: 'failed', reply: null };
        }
      }
      // AIRSUP-CHINA-END
      return conversations.sendMessage(caller.person_id, args);
    }
    if (name === 'end_conversation') {
      // AIRSUP-CHINA-BEGIN
      try {
        const chinaTalk = require('./china/talk');
        const ended = await chinaTalk.maybeEnd(caller, args && args.conversation_id);
        if (ended) return ended;
      } catch (error) {
        console.error('Airsup china end skipped:', error.message);
      }
      // AIRSUP-CHINA-END
      return conversations.endConversation(caller.person_id, args && args.conversation_id);
    }
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
        serverInfo: { name: 'airsup', version: '3.0.0' },
        instructions:
          `Airsup ${MCP_URL}. Identity is the plugin OAuth session. find_people, send_message, end_conversation only. send_message.person_id is the recipient. People: wait for the other person's Airsup AI. Companies: the factory AI replies in the same send_message result — show that reply immediately and keep conversation_id. Call send_message with person_id once to open the Airsup widget. After that, do not call send_message again for that factory — the user types in the same widget. If you must send another message, reuse conversation_id; that will not open another widget. If ChatGPT sends both ids, conversation_id wins when it exists.`,
      };
    }
    if (method === 'ping') return {};
    if (method === 'tools/list') return toolList();
    if (method === 'resources/list') {
      return { resources: [widgetResource()] };
    }
    if (method === 'resources/read') {
      if (isPublicResource(params.uri)) return widgetContents(params.uri);
      if (!caller) {
        const error = new Error('Airsup plugin OAuth required');
        error.code = -32000;
        throw error;
      }
      let contents = await conversationResourceContents(backing, caller.person_id, params.uri);
      // AIRSUP-CHINA-BEGIN
      try {
        const chinaTalk = require('./china/talk');
        contents = await chinaTalk.mergeResourceContents(caller, params.uri, contents);
      } catch (error) {
        console.error('Airsup china resource skipped:', error.message);
      }
      // AIRSUP-CHINA-END
      return contents;
    }
    if (method === 'prompts/list') return { prompts: [] };
    if (method === 'tools/call') {
      const data = await callTool(params.name, caller, params.arguments || {});
      if (params.name === 'send_message' || params.name === 'end_conversation') {
        return formatWidgetResult(backing, caller, data, {
          requestMeta: params._meta,
          args: params.arguments || {},
        });
      }
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
    if (req.method === 'GET' && !req.body) {
      return unauthorized(req, res);
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ jsonrpc: '2.0', error: { code: -32600, message: 'MCP uses POST' } });
    }
    const message = req.body || {};
    const method = message && message.method;
    const caller = await personFromRequest(req, backing);
    const publicMethod =
      method === 'initialize'
      || method === 'ping'
      || method === 'tools/list'
      || method === 'resources/list'
      || method === 'prompts/list'
      || (typeof method === 'string' && method.startsWith('notifications/'))
      || (method === 'resources/read' && isPublicResource(message.params && message.params.uri));
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
      console.error('Airsup MCP error:', error);
      res.status(200).json({
        jsonrpc: '2.0',
        id: message && message.id != null ? message.id : null,
        error: { code: error.code || -32603, message: error.message || 'Internal error' },
      });
    }
  }

  return { handleMcp, callTool, toolList, formatToolResult, conversations };
}

module.exports = {
  createMcp,
  toolList,
  formatToolResult,
  formatWidgetResult,
  extractBearer,
  publicOrigin,
  resourceMetadataUrl,
};
