# Revert Airsup China company onboarding (`/airsup/china`)

This slice is independent of people Airsup (`/airsup`, MCP, `airsup_people`).

## Remove only the company flow

1. Delete the folder `airsup/china/`
2. Remove the marked `AIRSUP-CHINA-BEGIN` / `AIRSUP-CHINA-END` blocks from:
   - `airsup/routes.js`
   - `airsup/find-people.js`
   - `airsup/mcp.js`
   - `server/server.js`
   - `airsup/sql/drop.sql` (the china drop lines)
   - `package.json` (`test:airsup-china` if present)
3. Run `airsup/china/sql/drop.sql` in the Supabase SQL editor **before** deleting the folder, or keep a copy of that file.

Do not drop `airsup_people`, `airsup_gmail_send`, conversations, or diary tables.

## After revert — verify

- `https://www.tademehl.com/airsup` still loads
- `/airsup/mcp` still serves the people plugin
- `/airsup/china` 404s
- `/airsup/live-companies.json` 404s
