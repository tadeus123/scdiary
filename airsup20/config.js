const MCP_URL = 'https://www.tademehl.com/airsup20/mcp';
const MCP_PROTOCOL = '2025-03-26';
const PLUGIN_SCOPE = 'airsup20';
const SERVER_NAME = 'airsup20';
const SERVER_VERSION = '1.0.0';

function googleClientId() {
  return process.env.AIRSUP20_GOOGLE_CLIENT_ID || process.env.AIRSUP_GOOGLE_CLIENT_ID || '';
}

function googleClientSecret() {
  return process.env.AIRSUP20_GOOGLE_CLIENT_SECRET || process.env.AIRSUP_GOOGLE_CLIENT_SECRET || '';
}

function sessionSecret() {
  return process.env.AIRSUP20_SESSION_SECRET
    || process.env.AIRSUP_SESSION_SECRET
    || process.env.SESSION_SECRET
    || 'airsup20-dev-secret';
}

function publicOriginFromEnv() {
  return (process.env.AIRSUP20_PUBLIC_ORIGIN || process.env.AIRSUP_PUBLIC_ORIGIN || '').replace(/\/$/, '');
}

function demoUsername() {
  return String(process.env.AIRSUP20_DEMO_USERNAME || 'airsup-reviewer').trim();
}

function demoPassword() {
  return String(process.env.AIRSUP20_DEMO_PASSWORD || '').trim();
}

module.exports = {
  MCP_URL,
  MCP_PROTOCOL,
  PLUGIN_SCOPE,
  SERVER_NAME,
  SERVER_VERSION,
  googleClientId,
  googleClientSecret,
  sessionSecret,
  publicOriginFromEnv,
  demoUsername,
  demoPassword,
};
