# Revert Airsup20

This slice is independent of China factory tables (`airsup_china_*`) and of the tademehl.com diary.

1. Remove the `AIRSUP20-BEGIN` / `AIRSUP20-END` block from `server.js` (airsup.co repo) or `server/server.js` (tademehl.com copy)
2. Remove `"airsup20/**"` from `vercel.json` `includeFiles` if present
3. Delete the `airsup20/` directory
4. Run `sql/drop.sql` in the **Airsup factory** Supabase (`wttyutffpgazxgwjzyuw`) — only `airsup20_*` tables

```bash
node airsup20/revert-airsup20.js
```

The script only edits the server mount and `vercel.json`. It does not drop database tables.
