const MCP_URL = 'https://www.tademehl.com/airsupdev/mcp';
const MCP_PROTOCOL = '2025-03-26';
const PLUGIN_SCOPE = 'airsupdev';
const SERVER_NAME = 'airsupdev';
const SERVER_VERSION = '1.1.0';

function googleClientId() {
  return process.env.AIRSUPDEV_GOOGLE_CLIENT_ID
    || process.env.AIRSUP20_GOOGLE_CLIENT_ID
    || process.env.AIRSUP_GOOGLE_CLIENT_ID
    || '';
}

function googleClientSecret() {
  return process.env.AIRSUPDEV_GOOGLE_CLIENT_SECRET
    || process.env.AIRSUP20_GOOGLE_CLIENT_SECRET
    || process.env.AIRSUP_GOOGLE_CLIENT_SECRET
    || '';
}

function sessionSecret() {
  return process.env.AIRSUPDEV_SESSION_SECRET
    || process.env.AIRSUP20_SESSION_SECRET
    || process.env.AIRSUP_SESSION_SECRET
    || process.env.SESSION_SECRET
    || 'airsupdev-dev-secret';
}

function publicOriginFromEnv() {
  return (process.env.PUBLIC_BASE_URL || process.env.SITE_URL || process.env.AIRSUP_PUBLIC_ORIGIN || 'https://www.tademehl.com')
    .replace(/\/$/, '');
}

/** Comma-separated allowlist. Default: tademehl@gmail.com */
function allowedEmails() {
  const raw = String(process.env.AIRSUPDEV_ALLOWED_EMAILS || 'tademehl@gmail.com').trim();
  return raw
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isEmailAllowed(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return false;
  return allowedEmails().includes(value);
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
  allowedEmails,
  isEmailAllowed,
};
