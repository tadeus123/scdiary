# AirCart sidecar (additive)

Isolated AirCart agent for **tademehl.com**. Does not replace the main Express site.

## Local sidecar

```bash
cd aircart-addon
npm install
npm run build
set PUBLIC_ORIGIN=https://tademehl.com
set PORT=8787
set HOST=127.0.0.1
npm start
```

Or from repo root: `npm run aircart`

Docker: `docker compose -f aircart-addon/docker-compose.yml up --build`

## Production (Vercel)

`vercel.json` routes only these paths to `aircart-addon/server.js`:

- `/.well-known/agent-card.json`
- `/a2a/v1` (+ subpaths)
- `/agent`
- `/agent/status.json`

All other traffic stays on `server/server.js`.
