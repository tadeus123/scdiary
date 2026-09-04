# Revert Airsup (`/airsup`)

When the user says **revert Airsup**, undo this install using this file.

## One-command revert

From the repo root:

```bash
node airsup/revert-airsup.js
```

Then commit + push (project rule: push to `origin main` unless the user says otherwise).

Then run `airsup/sql/drop.sql` in the Supabase SQL editor (drops `airsup_*` including calls and knowledge).

Remove these env vars if you added them: `AIRSUP_GOOGLE_CLIENT_ID`, `AIRSUP_GOOGLE_CLIENT_SECRET`, `AIRSUP_PUBLIC_ORIGIN`, `AIRSUP_SESSION_SECRET`, `AIRSUP_DIRECTORY_KEY`.

## What this install added

### Delete these files entirely
- `airsup/` (this folder, including REVERT.md and the revert script)
- `.cursor/rules/airsup.mdc`

### Remove marked blocks (`AIRSUP-BEGIN` … `AIRSUP-END`) from
- `server/server.js` — the Airsup require/use block
- `vercel.json` — `"airsup/**"` in `includeFiles`

### Do NOT touch
- Diary content, CSS design system, favicons, admin, bookshelf, cause, eisenkind, corner, edu, liquidity, graph, or `server/db/supabase.js`

## After revert — verify
- `https://tademehl.com/` loads
- `/airsup` 404s
- `/bookshelf`, `/corner`, `/edu` still work
