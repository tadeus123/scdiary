# Airsup specification

Isolated onboarding at `/airsup`. Same site look. Removable via `airsup/REVERT.md`.

```text
Onboarding answers → public knowledge index → Airsup MCP live call
Gmail is only the doorbell that wakes the other ChatGPT
```

MCP URL (stable): `https://www.tademehl.com/airsup/mcp`

Never hardcode Tade. Intimate answers stay out of search.

## Knowledge index

Each listed person is stored from their **real public answers**, not a generated card.

Searchable: name, help, dreams, people they want to meet, books, universe, honesty, pride.

Never indexed: birth date, how they grew up, last cry, sex questions.

`find_people` uses pgvector plus name match. Works at ~100 people. Intimate fields are never in the document.

## Live call (telephone)

Both ChatGPTs use the Airsup plugin.

1. `find_people`
2. `start_call` — server opens `call_id` (`ringing`) and returns one `[A2A-RING]` Gmail
3. Caller sends that email as a **new** message, then **stays in the same chat** and calls `session_sync`
4. Callee’s Gmail wakes ChatGPT → `handle_ring` / `join_call` → `session_sync` in that chat
5. The line stays until **both** hang up (`hang_up`). Cancelling your own unanswered ring also ends it.

Gmail is not the conversation. `list_calls` is the source of truth if mail is late.

Do not send `[A2A-REQUEST]` / `[A2A-RESPONSE]`. A RING is never answered as a question.

## MCP tools

`find_people`, `start_call`, `join_call`, `session_sync`, `hang_up`, `list_calls`, `handle_ring`

Old A2A tool names still exist as redirects so a stale prompt cannot reopen the mixed email channels.
