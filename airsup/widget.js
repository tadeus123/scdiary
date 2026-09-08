const fs = require('fs');
const path = require('path');

const WIDGET_URI = 'ui://widget/airsup-conversation.html';
const WIDGET_MIME = 'text/html;profile=mcp-app';

function widgetHtml() {
  return fs.readFileSync(path.join(__dirname, 'widgets/conversation.html'), 'utf8');
}

function widgetResource() {
  return {
    uri: WIDGET_URI,
    name: 'Airsup conversation',
    title: 'Airsup conversation',
    description: 'Airsup conversation panel.',
    mimeType: WIDGET_MIME,
  };
}

function widgetContents(uri) {
  const requested = String(uri || WIDGET_URI);
  if (!requested.startsWith(WIDGET_URI)) return { contents: [] };
  return {
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: WIDGET_MIME,
        text: widgetHtml(),
        _meta: { ui: { prefersBorder: true } },
      },
    ],
  };
}

function withConversationWidget(tool) {
  return {
    ...tool,
    _meta: {
      ui: { resourceUri: WIDGET_URI },
      'openai/outputTemplate': WIDGET_URI,
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Waiting for the other Airsup AI…',
      'openai/toolInvocation/invoked': 'Airsup conversation updated.',
    },
  };
}

module.exports = {
  WIDGET_URI,
  WIDGET_MIME,
  widgetResource,
  widgetContents,
  withConversationWidget,
};
