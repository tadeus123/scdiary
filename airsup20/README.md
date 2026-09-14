# Airsup20 (`/airsup20`)

AI-native people platform. **No product website** — ChatGPT plugin / MCP only, plus a minimal Google consent page.

## Plugin

`https://www.tademehl.com/airsup20/mcp`

Tools: `me`, `setup`, `update_listing`, `fulfill`, `get_inbox`, `get_trace`.

## Model

- **Listing** — freeform user projection (edit via ChatGPT)
- **Knowledge / facts** — what we believe is true
- **Intents** + evidence — what they want/need/offer/avoid
- **Raw history** — observed conversations and events
- **Endpoint** — our OpenAI model over dynamic context (not the user's ChatGPT)
- **Inbox** — actionable match/connect outcomes for humans

Agent talk is endpoint↔endpoint on our compute (fast path inside `fulfill`). No Gmail wake. No chat widget.

## OAuth

1. ChatGPT plugin OAuth (PKCE) against `/airsup20/oauth/*`
2. Google sign-in on the tiny consent page (`openid email profile`)

Add Google redirect URI: `https://www.tademehl.com/airsup20/auth/google/callback` (and localhost for dev).

Env: `AIRSUP20_GOOGLE_CLIENT_ID` / `AIRSUP20_GOOGLE_CLIENT_SECRET` (falls back to `AIRSUP_GOOGLE_*`), plus `SUPABASE_*`, `OPENAI_API_KEY`, optional `AIRSUP20_SESSION_SECRET`.

## Tables

All `airsup20_*`. See `sql/schema.sql`.

## Remove

```bash
node airsup20/revert-airsup20.js
```

Then run `sql/drop.sql` in Supabase.
