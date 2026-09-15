const MCP_URL = 'https://www.tademehl.com/airsupdev/mcp';
const MCP_PROTOCOL = '2025-03-26';
const SERVER_NAME = 'airsupdev';
const SERVER_VERSION = '1.0.0';

function mcpSecret() {
  return String(process.env.AIRSUPDEV_MCP_SECRET || '').trim();
}

function publicOriginFromEnv() {
  return (process.env.PUBLIC_BASE_URL || process.env.SITE_URL || process.env.AIRSUP_PUBLIC_ORIGIN || 'https://www.tademehl.com')
    .replace(/\/$/, '');
}

module.exports = {
  MCP_URL,
  MCP_PROTOCOL,
  SERVER_NAME,
  SERVER_VERSION,
  mcpSecret,
  publicOriginFromEnv,
};
