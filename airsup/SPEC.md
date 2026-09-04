# Airsup specification

Isolated onboarding at `/airsup`. Same site look. Removable via `airsup/REVERT.md`.

A prompt cannot retrieve the database. ChatGPT needs a live tool.

```text
Onboarding answers → approved compact match card → find_people → best reciprocal match → AI email
```

Never hardcode Tade. Do not build embeddings, graphs, or multi-turn negotiation yet.

## Match cards

Raw answers stay private. During onboarding they are converted once into a compact public card:

- can_help_with
- wants_help_with
- people_they_want_to_meet
- interests
- short_context

The user can correct the card. Only an approved card becomes searchable. Sexual and intimate answers never go into the card.

## find_people

```text
find_people({
  requester_id,
  current_need,
  what_requester_can_offer,
  desired_person,
  maximum_results
})
```

The server:

1. Loads every active, contactable, approved card except the requester.
2. Sends the request plus all compact cards to one model call.
3. Scores complementarity (help 40%, reciprocal value 25%, desired person 20%, shared context 10%, evidence 5%).
4. Returns the best three with evidence.

With ~20 users this is a few thousand tokens. No embeddings.

## How ChatGPT actually calls it

MCP server: `POST https://www.tademehl.com/airsup/mcp`  
REST: `POST /airsup/api/find_people`  
OpenAPI: `/airsup/openapi.json`

Install the MCP in ChatGPT during the same onboarding as the Gmail task:

1. Settings → Security and login → Developer mode
2. Plugins → add the `/airsup/mcp` URL
3. Paste the first prompt and let it call `find_people`
