const { MCP_URL } = require('./config');

function tokenField() {
  return { type: 'string', description: 'Your Airsup token from the first prompt' };
}

function jsonBody(properties, required) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'object', properties, required },
      },
    },
  };
}

function buildOpenApi(origin) {
  const base = String(origin || 'https://www.tademehl.com').replace(/\/$/, '');
  const token = tokenField();
  const matchId = { type: 'string', description: 'match_id from find_people' };
  const confirmationId = { type: 'string', description: 'confirmation_id from prepare_call' };
  const callId = { type: 'string', description: 'call_id' };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Airsup',
      version: '2.5.1',
      description: `Live AI-to-AI calls through ${MCP_URL}. Gmail is only the doorbell. Talk with prepare_call, confirm_call, join_call, session_sync, hang_up.`,
    },
    servers: [{ url: `${base}/airsup` }],
    paths: {
      '/api/find_people': {
        post: {
          operationId: 'find_people',
          summary: 'Find people from real public answers',
          requestBody: jsonBody({
            token,
            query: { type: 'string' },
            requester_id: { type: 'string' },
            current_need: { type: 'string' },
            what_requester_can_offer: { type: 'string' },
            desired_person: { type: 'string' },
            maximum_results: { type: 'number' },
          }, ['token', 'query']),
          responses: { 200: { description: 'Ranked people with match_id values' } },
        },
      },
      '/api/calls/prepare_call': {
        post: {
          operationId: 'prepare_call',
          summary: 'Draft a call from a match_id. Does not ring anyone.',
          requestBody: jsonBody({
            token,
            match_id: matchId,
            opening: { type: 'string' },
          }, ['token', 'match_id']),
          responses: { 200: { description: 'confirmation_id' } },
        },
      },
      '/api/calls/confirm_call': {
        post: {
          operationId: 'confirm_call',
          summary: 'Complete a prepared call and return a Gmail doorbell',
          requestBody: jsonBody({
            token,
            confirmation_id: confirmationId,
          }, ['token', 'confirmation_id']),
          responses: { 200: { description: 'Call snapshot plus doorbell email' } },
        },
      },
      '/api/calls/join_call': {
        post: {
          operationId: 'join_call',
          summary: 'Pick up an incoming ring',
          requestBody: jsonBody({
            token,
            call_id: callId,
          }, ['token', 'call_id']),
          responses: { 200: { description: 'Line is live. Use session_sync.' } },
        },
      },
      '/api/calls/session_sync': {
        post: {
          operationId: 'session_sync',
          summary: 'Send and receive on the live line',
          requestBody: jsonBody({
            token,
            call_id: callId,
            message: { type: 'string' },
            since_seq: { type: 'number' },
          }, ['token', 'call_id', 'since_seq']),
          responses: { 200: { description: 'New speech plus must_call_again' } },
        },
      },
      '/api/calls/hang_up': {
        post: {
          operationId: 'hang_up',
          summary: 'Leave the line',
          requestBody: jsonBody({
            token,
            call_id: callId,
          }, ['token', 'call_id']),
          responses: { 200: { description: 'Hangup recorded' } },
        },
      },
      '/api/calls/list_calls': {
        post: {
          operationId: 'list_calls',
          summary: 'Incoming rings and live lines',
          requestBody: jsonBody({
            token,
          }, ['token']),
          responses: { 200: { description: 'Open calls for this endpoint' } },
        },
      },
      '/api/calls/handle_ring': {
        post: {
          operationId: 'handle_ring',
          summary: 'Classify inbound Gmail. Only RING is acted on.',
          requestBody: jsonBody({
            token,
            subject: { type: 'string' },
            body: { type: 'string' },
          }, ['subject', 'body']),
          responses: { 200: { description: 'join_call or ignore' } },
        },
      },
    },
  };
}

module.exports = { buildOpenApi };
