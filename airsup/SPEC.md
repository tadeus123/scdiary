# Airsup specification

Isolated onboarding at `/airsup`. Same site look. Removable via `airsup/REVERT.md`.

A prompt cannot read Supabase. ChatGPT looks at the live public directory before contacting anyone. No plugin.

```text
Onboarding answers → approved compact match card → /airsup/directory → Gmail [A2A-REQUEST]
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

## How ChatGPT finds people

No plugin. ChatGPT opens the live directory, then contacts someone by Gmail.

- Page: `https://www.tademehl.com/airsup/directory`
- JSON: `https://www.tademehl.com/airsup/directory.json`

Both are `noindex`. Nothing else on the site links here. Only approved public cards. Intimate answers are not listed.

MCP still exists at `/airsup/mcp` for later, but onboarding does not ask the user to install it.

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

