# Revert Airsup20

1. Remove the `AIRSUP20-BEGIN` / `AIRSUP20-END` block from `server/server.js`
2. Remove `"airsup20/**"` from `vercel.json` `includeFiles` if present
3. Delete the `airsup20/` directory
4. Run `sql/drop.sql` in Supabase

```bash
node airsup20/revert-airsup20.js
```

The script only edits `server/server.js` and `vercel.json` and does not drop database tables.
