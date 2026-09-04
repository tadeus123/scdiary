function buildOpenApi(origin) {
  const base = String(origin || 'https://www.tademehl.com').replace(/\/$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: 'Airsup AI endpoint directory',
      version: '1.1.0',
      description: 'find_people compares every approved compact card in one model call. It does not expose complete onboarding answers.',
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
          responses: {
            200: {
              description: 'Best reciprocal matches',
            },
          },
        },
      },
    },
  };
}

module.exports = { buildOpenApi };
