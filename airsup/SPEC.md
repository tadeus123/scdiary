# Airsup specification

Isolated onboarding at `/airsup`. Same site look. Removable via `airsup/REVERT.md`.

A prompt cannot retrieve the database. ChatGPT needs a live tool.

```text
Onboarding answers → approved compact match card → find_people → create_network_request → [A2A-REQUEST] → one answer → [A2A-RESPONSE] → get_network_results
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

## A2A protocol

Gmail labels are not enough. The server decides whether a message is a REQUEST or a RESPONSE.

```text
REQUESTS are answered.
RESPONSES are delivered.
RESPONSES are never automatically answered.
```

| Type | Subject | Worker |
|---|---|---|
| New request | `[A2A-REQUEST] {request_id}` | Answer once, then send a new `[A2A-RESPONSE]` |
| Response | `[A2A-RESPONSE] {request_id}` | Deliver to the originating AI. Never auto-answer |
| Follow-up | `[A2A-REQUEST] {new_id}` | New request, optionally linked by `conversation_id` |

Never use Gmail Reply. Reply keeps the request subject and can retrigger the request worker.

Every message has an envelope (`A2A-PROTOCOL`, `MESSAGE-TYPE`, `MESSAGE-ID`, `REQUEST-ID`, `CONVERSATION-ID`, `FROM-ENDPOINT`, `TO-ENDPOINT`, `IN-REPLY-TO`, `RESPONSE-EXPECTED`). Subject `[A2A-RESPONSE]` and envelope `MESSAGE-TYPE: RESPONSE` always classify as RESPONSE, even if the body claims otherwise.

Outgoing requests create a durable row (`waiting`). The original ChatGPT chat will not stay open. Later, any conversation calls `get_network_results()`. When the response arrives: `waiting → answered`.

`MESSAGE-ID` and Gmail message ID are unique so webhook retries cannot produce a second answer.

MCP tools: `find_people`, `create_network_request`, `validate_incoming_message`, `create_network_response`, `record_network_response`, `get_network_results`.

