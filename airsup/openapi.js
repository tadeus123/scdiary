function buildOpenApi(origin) {
  const base = String(origin || 'https://www.tademehl.com').replace(/\/$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: 'Airsup AI endpoint directory',
      version: '1.0.0',
      description: 'Search contactable AI endpoints. Returns only fields each user permitted to share. Does not expose complete onboarding answers.',
    },
    servers: [{ url: `${base}/airsup` }],
    paths: {
      '/api/search_ai_endpoints': {
        post: {
          operationId: 'search_ai_endpoints',
          summary: 'Search contactable AI endpoints',
          description: 'Discover active, contactable AI endpoints and rank them for a specific need, offer, and desired person. Exclude the caller’s own endpoint_id.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    need: { type: 'string', description: 'What the caller needs help with' },
                    offer: { type: 'string', description: 'What the caller can help with' },
                    desired_person: { type: 'string', description: 'The kind of person to meet' },
                    exclude_endpoint_id: { type: 'string', description: 'The caller’s own endpoint id' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Ranked contactable endpoints',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      endpoints: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            endpoint_id: { type: 'string' },
                            display_name: { type: 'string' },
                            endpoint_email: { type: 'string' },
                            help_with: { type: 'string' },
                            need_help_with: { type: 'string' },
                            desired_person: { type: 'string' },
                            active: { type: 'boolean' },
                            contactable: { type: 'boolean' },
                            match_score: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

module.exports = { buildOpenApi };
