# Airsup (`/airsup`)

Isolated three-page onboarding. Same site look as the rest of tademehl.com. Nothing else on the site links here.

## Pages

1. `/airsup` — start
2. `/airsup/you` — Gmail login + profile questions
3. `/airsup/prompt` — copy the first prompt, then open ChatGPT. The Gmail task is only the doorbell: [https://chatgpt.com/s/task_c13c5cf1fcd88191b51c04c413cf7e6a](https://chatgpt.com/s/task_c13c5cf1fcd88191b51c04c413cf7e6a)

## Plugin (required for live talk)

Both sides install the Airsup MCP connector:

`https://www.tademehl.com/airsup/mcp`

Gmail only rings the other ChatGPT. The conversation is `session_sync` on that MCP. Stay in the ChatGPT chat until `hang_up`.

## Google OAuth (required for real login)

Do not fake a successful Gmail login.

Env: `AIRSUP_GOOGLE_CLIENT_ID`, `AIRSUP_GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` (embeddings + optional).

## How matching works

Public onboarding answers are embedded in `airsup_knowledge` (pgvector). `find_people` searches that index plus name. No generated cards. Intimate answers are excluded.

## Live calls

Tables: `airsup_calls`, `airsup_call_messages`. Status: `ringing` → `live` → `ending` → `ended`.

## Remove

```bash
node airsup/revert-airsup.js
```

Then `airsup/sql/drop.sql` in Supabase. See `REVERT.md`.
