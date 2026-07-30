export type AirCartStatus = {
  product: string;
  website: string;
  summary: string;
  nowDoing: string;
  focus: string[];
  nextUp: string[];
  updatedAt: string;
  contact: string;
};

/** Edit this object (or overwrite via POST /agent/status) to change what AirCart reports. */
export const defaultStatus: AirCartStatus = {
  product: "AirCart",
  website: "https://tademehl.com",
  summary:
    "AirCart is building a web-native agent gateway so company websites can expose their own AI agent through their existing domain using A2A.",
  nowDoing:
    "Live on tademehl.com and ready to answer what AirCart is doing right now.",
  focus: [
    "Agent Card discovery at /.well-known/agent-card.json",
    "Direct A2A conversations on /a2a/v1",
    "Human status page at /agent",
  ],
  nextUp: [
    "Connect your real company agent or webhook",
    "Ask ChatGPT to open the AirCart URLs on tademehl.com",
    "Keep the sidecar running alongside the existing site",
  ],
  updatedAt: new Date().toISOString(),
  contact: "https://tademehl.com/agent",
};

let currentStatus: AirCartStatus = { ...defaultStatus, updatedAt: new Date().toISOString() };

export function getStatus(): AirCartStatus {
  return currentStatus;
}

export function setStatus(patch: Partial<AirCartStatus>): AirCartStatus {
  currentStatus = {
    ...currentStatus,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return currentStatus;
}
