# Revert Games (`/games`)

When the user says **delete the games slice** (or revert Games), undo this install using this file.

## One-command revert

From the repo root:

```bash
node games/revert-games.js
```

Then delete the `games/` folder, commit, and push.

Then run `games/sql/drop.sql` in the Supabase SQL editor (drops only `games_highscore`).

## What this install added

### Delete these files entirely
- `games/` (this folder, including REVERT.md and the revert script)
- `.cursor/rules/games.mdc`

### Remove marked blocks (`GAMES-BEGIN` … `GAMES-END`) from
- `server/server.js` — the Games require/use block
- `vercel.json` — `"games/**"` in `includeFiles`

### Do NOT touch
- Diary content, CSS design system, favicons, admin, bookshelf, cause, eisenkind, corner, edu, liquidity, graph, airsup, airsup20, airsupdev, or `server/db/supabase.js`

## After revert — verify
- `https://tademehl.com/` loads
- `/games` 404s
- `/bookshelf`, `/corner`, `/edu` still work
