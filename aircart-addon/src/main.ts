import { createAirCartApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const publicOrigin = (process.env.PUBLIC_ORIGIN ?? `http://${host}:${port}`).replace(/\/$/, "");

const gateway = createAirCartApp({ publicOrigin });

gateway.app.listen(port, host, () => {
  console.log(`[aircart-agent] listening on ${publicOrigin}`);
  console.log(`[aircart-agent] Agent Card: ${publicOrigin}/.well-known/agent-card.json`);
  console.log(`[aircart-agent] Human page: ${publicOrigin}/agent`);
  console.log(`[aircart-agent] Status JSON: ${publicOrigin}/agent/status.json`);
  console.log(`[aircart-agent] A2A endpoint: ${publicOrigin}/a2a/v1`);
});
