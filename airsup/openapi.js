function buildOpenApi(origin) {
  const base = String(origin || 'https://www.tademehl.com').replace(/\/$/, '');
  const endpoint = { type: 'string', description: 'Airsup endpoint_id' };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Airsup AI endpoint directory',
      version: '1.2.0',
      description: 'find_people compares compact cards. A2A tools keep REQUESTS and RESPONSES on separate channels. REQUESTS are answered. RESPONSES are delivered. RESPONSES are never automatically answered.',
    },
    servers: [{ url: `${base}/airsup` }],
    paths: {
      '/api/find_people': {
        post: {
          operationId: 'find_people',
          summary: 'Find reciprocal matches',
          description: 'Load every active approved compact card except the requester, score complementarity in one model call, return the best matches with evidence.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    requester_id: { type: 'string' },
                    current_need: { type: 'string' },
                    what_requester_can_offer: { type: 'string' },
                    desired_person: { type: 'string' },
                    maximum_results: { type: 'number' },
                  },
                  required: ['requester_id', 'current_need'],
                },
              },
            },
          },
          responses: { 200: { description: 'Best reciprocal matches' } },
        },
      },
      '/api/a2a/create_network_request': {
        post: {
          operationId: 'create_network_request',
          summary: 'Create a durable waiting request and a new [A2A-REQUEST] email',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    this_endpoint: endpoint,
                    target_endpoint: endpoint,
                    request: { type: 'string' },
                    conversation_id: { type: 'string' },
                  },
                  required: ['this_endpoint', 'target_endpoint', 'request'],
                },
              },
            },
          },
          responses: { 200: { description: 'Waiting request plus new-message email. Do not use Gmail Reply.' } },
        },
      },
      '/api/a2a/validate_incoming_message': {
        post: {
          operationId: 'validate_incoming_message',
          summary: 'Classify an inbound email as REQUEST or RESPONSE',
          description: 'The server decides the channel. Subject [A2A-RESPONSE] and envelope MESSAGE-TYPE: RESPONSE can never be auto-answered.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    this_endpoint: endpoint,
                    subject: { type: 'string' },
                    body: { type: 'string' },
                    gmail_message_id: { type: 'string' },
                  },
                  required: ['this_endpoint', 'subject', 'body'],
                },
              },
            },
          },
          responses: { 200: { description: 'action is answer, deliver, or ignore' } },
        },
      },
      '/api/a2a/create_network_response': {
        post: {
          operationId: 'create_network_response',
          summary: 'Create a new [A2A-RESPONSE] email for a REQUEST this endpoint was asked',
          responses: { 200: { description: 'New-message email. Never Gmail Reply.' } },
        },
      },
      '/api/a2a/record_network_response': {
        post: {
          operationId: 'record_network_response',
          summary: 'Attach an arrived RESPONSE to the durable waiting request',
          responses: { 200: { description: 'waiting → answered. Never auto-answer.' } },
        },
      },
      '/api/a2a/get_network_results': {
        post: {
          operationId: 'get_network_results',
          summary: 'Read durable A2A state from any later conversation',
          responses: { 200: { description: 'waiting, answered, and inbox' } },
        },
      },
    },
  };
}

module.exports = { buildOpenApi };
