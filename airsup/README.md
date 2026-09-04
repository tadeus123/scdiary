# Airsup (`/airsup`)

Isolated three-page onboarding. Same site look as the rest of tademehl.com. Nothing else on the site links here.

## Pages

1. `/airsup` — start
2. `/airsup/you` — Gmail login + profile questions
3. `/airsup/prompt` — generated first prompt

## Google OAuth (required for real login)

Do not fake a successful Gmail login. Until these are set, the Gmail button opens the setup notes page.

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application
2. Authorized redirect URIs:
   - `http://localhost:3000/airsup/auth/google/callback`
   - `https://www.tademehl.com/airsup/auth/google/callback`
   - `https://tademehl.com/airsup/auth/google/callback`
3. Environment variables (local `.env` and Vercel):
   - `AIRSUP_GOOGLE_CLIENT_ID`
   - `AIRSUP_GOOGLE_CLIENT_SECRET`
4. Optional: `AIRSUP_PUBLIC_ORIGIN` if the public URL cannot be inferred (example: `https://www.tademehl.com`)

Saving profiles also needs `SUPABASE_SERVICE_ROLE_KEY` (already used by some local scripts). The anon key cannot read `airsup_profiles` or `airsup_endpoints`.

## AI endpoint directory

Consenting users are registered in `airsup_endpoints` with public fields only. Intimate onboarding answers stay private.

- Search: `POST /airsup/api/search_ai_endpoints`
- OpenAPI for ChatGPT actions: `/airsup/openapi.json`
- Spec: `airsup/SPEC.md`

Optional production key: `AIRSUP_DIRECTORY_KEY` (send as `Authorization: Bearer …` or `X-Airsup-Key`). If unset, search still returns only contactable public cards.

## How matching actually works

A prompt cannot read Supabase. ChatGPT must call a tool.

1. Onboarding answers stay private.
2. A compact **public card** is generated (no intimate answers). The user can edit it, then Finish approves it into `airsup_endpoints`.
3. `find_people` loads every approved card except the requester and scores them in **one model call**. No embeddings. Fine for ~20 users.
4. ChatGPT gets that tool through MCP:

`https://www.tademehl.com/airsup/mcp`

Install during the same onboarding as the Gmail task: ChatGPT Settings → Security and login → Developer mode → Plugins → add that URL.

REST: `POST /airsup/api/find_people`  
OpenAPI: `/airsup/openapi.json`

Needs `OPENAI_API_KEY` for card generation and matching.

## A2A request / response split

Two logical channels plus durable state. The network server, not the email body, decides the type.

- `create_network_request` stores `status: waiting` and returns a **new** `[A2A-REQUEST]` email. Do not use Gmail Reply.
- The request worker only runs when the subject contains `[A2A-REQUEST]`. It answers once, then `create_network_response` sends a **new** `[A2A-RESPONSE]`.
- The response worker only runs when the subject contains `[A2A-RESPONSE]`. It records the answer for the originating endpoint and **never answers**.
- Later chats call `get_network_results()`. The original ChatGPT conversation does not stay open.

REST: `POST /airsup/api/a2a/validate_incoming_message` (and the other `/airsup/api/a2a/*` tools).  
Tables: `airsup_network_requests`, `airsup_network_messages` (unique `message_id` and `gmail_message_id`).

## Remove

```bash
node airsup/revert-airsup.js
```

Then delete the `airsup/` folder and run `airsup/sql/drop.sql` in Supabase.

See `REVERT.md`.
