# Revert invisible Airsup / Supi discovery

When the user says **revert** (Airsup / Supi / discovery):

```bash
node airsup/revert-airsup.js
```

Then commit + push to `origin main` unless they say otherwise.

## Delete
- `server/airsup-proxy.js`
- `server/airsup-discovery-headers.js`
- `airsup/` (after running the script)

## Strip `AIRSUP-BEGIN` … `AIRSUP-END` from
- `server/server.js`
- `views/partials/seo-head.ejs`
- `server/utils/seo.js`
- `public/robots.txt` (restore snapshot)
- `vercel.json` includeFiles

No homepage logo was installed in this variant.
