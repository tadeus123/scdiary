const fs = require('fs');
const path = require('path');

// Legacy URI kept for any stale host cache lookups; Airsup no longer mounts a conversation widget.
const WIDGET_URI = 'ui://widget/airsup-conversation-v19.html';
const WIDGET_MIME = 'text/html;profile=mcp-app';
const WIDGET_DOMAIN = 'https://www-tademehl-com.oaiusercontent.com';

let cachedHtml = '';

function widgetMeta() {
  return {
    ui: {
      prefersBorder: false,
      domain: WIDGET_DOMAIN,
      csp: {
        connectDomains: [],
        resourceDomains: [],
      },
    },
    'openai/widgetDescription': 'Unused. Airsup conversations have no visual widget.',
    'openai/widgetPrefersBorder': false,
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
    description: 'Unused. Airsup does not mount a conversation UI.',
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

/** Tool meta for native ChatGPT status lines only — never mounts an MCP App widget. */
function withConversationWidget(tool) {
  return {
    ...tool,
    _meta: {
      'openai/toolInvocation/invoking': 'Talking on Airsup',
      'openai/toolInvocation/invoked': 'Airsup',
    },
  };
}

function shouldMountConversationWidget() {
  return false;
}

module.exports = {
  WIDGET_URI,
  WIDGET_MIME,
  widgetResource,
  widgetContents,
  withConversationWidget,
  shouldMountConversationWidget,
};
