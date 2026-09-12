const fs = require('fs');
const path = require('path');

const WIDGET_URI = 'ui://widget/airsup-conversation-v15.html';
const WIDGET_MIME = 'text/html;profile=mcp-app';
const WIDGET_DOMAIN = 'https://www-tademehl-com.oaiusercontent.com';

let cachedHtml = '';

function widgetMeta() {
  return {
    ui: {
      prefersBorder: true,
      domain: WIDGET_DOMAIN,
      csp: {
        connectDomains: [],
        resourceDomains: [],
      },
    },
    'openai/widgetDescription': 'Live Airsup conversation: transcript, send, end, and thread switch.',
    'openai/widgetPrefersBorder': true,
    'openai/widgetDomain': WIDGET_DOMAIN,
    'openai/widgetCSP': {
      connect_domains: [],
      resource_domains: [],
    },
  };
}

function widgetHtml() {
  if (!cachedHtml) cachedHtml = fs.readFileSync(path.join(__dirname, 'widgets/conversation.html'), 'utf8');
  return cachedHtml;
}

function widgetResource() {
  return {
    uri: WIDGET_URI,
    name: 'Airsup conversation',
    title: 'Airsup conversation',
    description: 'Live Airsup conversation: transcript, send, end, and thread switch.',
    mimeType: WIDGET_MIME,
    _meta: widgetMeta(),
  };
}

function widgetContents(uri) {
  const requested = String(uri || WIDGET_URI);
  if (!requested.startsWith('ui://widget/airsup-conversation')) return { contents: [] };
  return {
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: WIDGET_MIME,
        text: widgetHtml(),
        _meta: widgetMeta(),
      },
    ],
  };
}

function withConversationWidget(tool, opts) {
  const meta = {
    ui: { visibility: ['model', 'app'] },
    'openai/widgetAccessible': true,
    'openai/toolInvocation/invoking': 'Sending',
    'openai/toolInvocation/invoked': 'Airsup',
  };
  if (opts && opts.template) {
    meta.ui.resourceUri = WIDGET_URI;
    meta['openai/outputTemplate'] = WIDGET_URI;
  }
  return { ...tool, _meta: meta };
}

function shouldMountConversationWidget(opts) {
  const args = (opts && opts.args) || {};
  const meta = (opts && opts.requestMeta) || {};
  if (meta['openai/widgetSessionId']) return false;
  const conversationId = String(args.conversation_id || '').trim();
  const personId = String(args.person_id || '').trim();
  return Boolean(personId) && !conversationId;
}

module.exports = {
  WIDGET_URI,
  WIDGET_MIME,
  widgetResource,
  widgetContents,
  withConversationWidget,
  shouldMountConversationWidget,
};
