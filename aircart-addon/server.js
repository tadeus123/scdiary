import { createAirCartApp } from "./dist/app.js";

/**
 * Vercel serverless entry for the AirCart sidecar.
 * Mounted only for the four AirCart paths via vercel.json routes.
 */
const publicOrigin = (process.env.PUBLIC_ORIGIN || "https://tademehl.com").replace(/\/$/, "");
const gateway = createAirCartApp({ publicOrigin });

export default gateway.app;
