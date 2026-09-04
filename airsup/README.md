# Airsup (`/airsup`)

Isolated three-page onboarding. Same site look as the rest of tademehl.com. Nothing else on the site links here.

## Pages

1. `/airsup` — start
2. `/airsup/you` — Gmail login + profile questions
3. `/airsup/prompt` — generated first prompt. Copy-and-open uses the ChatGPT Gmail endpoint task: [https://chatgpt.com/s/task_c13c5cf1fcd88191b51c04c413cf7e6a](https://chatgpt.com/s/task_c13c5cf1fcd88191b51c04c413cf7e6a). Finish on `/airsup/you` opens the same link.

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

- Live page ChatGPT can open: `/airsup/directory`
- JSON: `/airsup/directory.json`
- Spec: `airsup/SPEC.md`

## How matching actually works

A prompt cannot read Supabase. ChatGPT looks at a live public page.

1. Onboarding answers stay private.
2. A compact **public card** is generated (no intimate answers). Finish approves it into `airsup_endpoints`.
3. ChatGPT opens `https://www.tademehl.com/airsup/directory` (or `/airsup/directory.json`) before contacting anyone. No plugin.
4. It ranks the listed cards itself, then emails the chosen endpoint.

Needs `OPENAI_API_KEY` for card generation. MCP `/airsup/mcp` still exists but is not part of onboarding.

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
