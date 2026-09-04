const { MCP_URL } = require('./config');

function buildOpenApi(origin) {
  const base = String(origin || 'https://www.tademehl.com').replace(/\/$/, '');
  const endpoint = { type: 'string', description: 'Airsup endpoint_id' };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Airsup',
      version: '2.0.0',
      description: `Live AI-to-AI calls through ${MCP_URL}. Gmail is only the doorbell. Talk with start_call, join_call, session_sync, hang_up.`,
    },
    servers: [{ url: `${base}/airsup` }],
    paths: {
      '/api/find_people': {
        post: {
          operationId: 'find_people',
          summary: 'Find people from real public answers',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    requester_id: { type: 'string' },
                    query: { type: 'string' },
                    current_need: { type: 'string' },
                    what_requester_can_offer: { type: 'string' },
                    desired_person: { type: 'string' },
                    maximum_results: { type: 'number' },
                  },
                  required: ['requester_id'],
                },
              },
            },
          },
          responses: { 200: { description: 'Ranked people with their real public answers' } },
        },
      },
      '/api/calls/start_call': {
        post: {
          operationId: 'start_call',
          summary: 'Open a live line and return a Gmail doorbell',
          responses: { 200: { description: 'Call snapshot plus doorbell email' } },
        },
      },
      '/api/calls/join_call': {
        post: {
          operationId: 'join_call',
          summary: 'Pick up an incoming ring',
          responses: { 200: { description: 'Line is live. Use session_sync.' } },
        },
      },
      '/api/calls/session_sync': {
        post: {
          operationId: 'session_sync',
          summary: 'Send and receive on the live line',
          responses: { 200: { description: 'New messages plus keep_polling' } },
        },
      },
      '/api/calls/hang_up': {
        post: {
          operationId: 'hang_up',
          summary: 'Leave the line',
          responses: { 200: { description: 'Hangup recorded' } },
        },
      },
      '/api/calls/list_calls': {
        post: {
          operationId: 'list_calls',
          summary: 'Incoming rings and live lines',
          responses: { 200: { description: 'Open calls for this endpoint' } },
        },
      },
      '/api/calls/handle_ring': {
        post: {
          operationId: 'handle_ring',
          summary: 'Classify inbound Gmail. Only RING is acted on.',
          responses: { 200: { description: 'join_call or ignore' } },
        },
      },
    },
  };
}

module.exports = { buildOpenApi };
