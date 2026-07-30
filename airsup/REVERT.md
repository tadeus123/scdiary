# Revert Airsup / Supi discovery (tademehl.com)

When the user says **revert** (Airsup / Supi / discovery), undo this install using this file.

## One-command revert

From the repo root:

```bash
node airsup/revert-airsup.js
```

Then commit + push (project rule: push to `origin main` unless user says otherwise).

## What this install added

### Delete these files entirely
- `server/airsup-proxy.js`
- `server/airsup-discovery-headers.js`
- `views/partials/airsup-supi-logo.ejs`
- `airsup/` (this folder, including REVERT.md and the revert script)
- Optional leftover (unrelated old AirCart experiment, safe to leave or delete): `aircart-addon/`

### Remove marked blocks (`AIRSUP-BEGIN` … `AIRSUP-END`) from
- `server/server.js` — remove the Airsup require/use block
- `views/partials/seo-head.ejs` — remove the four discovery `<link>` tags
- `views/index.ejs` — remove `<%- include('partials/airsup-supi-logo') %>`
- `server/utils/seo.js` — remove the discoveryLocs sitemap loop
- `public/robots.txt` — restore from `airsup/snapshots/robots.txt.pre-airsup`
- `vercel.json` — remove `server/airsup-proxy.js` and `server/airsup-discovery-headers.js` from `includeFiles` if present

### Do NOT touch
- Diary content, CSS design system, favicons, admin, bookshelf, cause, eisenkind, corner, etc.

## After revert — verify
- `https://tademehl.com/` loads, no `/supi.svg` logo
- `/.well-known/agent-card.json` may 404 (expected)
- `/corner`, `/bookshelf` still work
