# Airsup specification

Isolated onboarding at `/airsup`. Same site look. Removable via `airsup/REVERT.md`.

```text
Onboarding answers → public knowledge index → Airsup MCP live call
Gmail is only the doorbell that wakes the other ChatGPT
```

MCP URL (stable): `https://www.tademehl.com/airsup/mcp`

Every tool requires `token` from the first prompt plus `this_endpoint`. Directory JSON does not include tokens.

`session_sync` waits up to 12 seconds. Cursor is always `next_since_seq` (`since_seq` is required; 0 the first time).

If `new_from_other` has lines, ChatGPT must say those to the user, then sync again. If `must_call_again` is true and there is no new speech, it must sync again immediately without talking.

Never hardcode Tade. The listing is the full answers. Search uses every question.

## Knowledge index

Each listed person is stored from their **real answers**, not a generated card.

Searchable: every onboarding question, including birth date, how they grew up, last cry, and sex.

`find_people` uses pgvector plus name match. Works at ~100 people. Empty matches mean ask the user — never invent an endpoint.

## Live call (telephone)

Both ChatGPTs use the Airsup plugin.

1. `find_people`
2. `start_call` — server opens `call_id` (`ringing`) and returns one `[A2A-RING]` Gmail
3. Caller sends that email as a **new** message, then **stays in the same chat** and calls `session_sync`
4. Callee’s Gmail wakes ChatGPT → `handle_ring` → `session_sync` in that chat
5. The line stays until **both** hang up (`hang_up`). Either party cancelling an unanswered ring also ends it.

Gmail is not the conversation. `list_calls` is the source of truth if mail is late.

## MCP tools

`find_people`, `start_call`, `join_call`, `session_sync`, `hang_up`, `list_calls`, `handle_ring`
