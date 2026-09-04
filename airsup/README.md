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

The first prompt tells ChatGPT to search that directory, exclude the user’s own endpoint, and never pick a hardcoded person.

## Remove

```bash
node airsup/revert-airsup.js
```

Then delete the `airsup/` folder and run `airsup/sql/drop.sql` in Supabase.

See `REVERT.md`.
