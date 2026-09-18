const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createMcp } = require('./mcp');
const { deriveOnboardingStatus, timingSafeEqualString, callTool } = require('./services');
const { isEmailAllowed, allowedEmails } = require('./config');
const auth = require('./auth');
const pluginOauth = require('./oauth-plugin');

const TOOL_NAMES = [
  'lookup_supplier',
  'create_supplier_draft',
  'get_supplier_card',
  'update_supplier_card',
  'create_magic_link',
  'get_onboarding_status',
  'verify_supplier',
  'publish_supplier',
  'test_supplier_discovery',
  'enrich_supplier',
  'get_enrichment_gaps',
  'generate_demo',
  'get_growth_funnel',
  'get_supplier_events',
];

for (const name of TOOL_NAMES) {
  const file = path.join(__dirname, 'tools', `${name}.json`);
  assert.ok(fs.existsSync(file), `missing tool schema ${name}`);
  const tool = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(tool.name, name);
}

const mcp = createMcp();
assert.deepStrictEqual(mcp.TOOL_FILES, TOOL_NAMES);
assert.strictEqual(mcp.toolList().tools.length, 14);

assert.strictEqual(timingSafeEqualString('abc', 'abc'), true);
assert.strictEqual(timingSafeEqualString('abc', 'abd'), false);

assert.ok(allowedEmails().includes('tademehl@gmail.com'));
assert.strictEqual(isEmailAllowed('tademehl@gmail.com'), true);
assert.strictEqual(isEmailAllowed('random@gmail.com'), false);
assert.strictEqual(auth.isEmailAllowed('tademehl@gmail.com'), true);

assert.strictEqual(
  deriveOnboardingStatus({
    company: { status: 'live', company_name: 'x', city: 'shenzhen', goal: 'g', profile: { processes: ['cnc'] } },
    allow: null,
    tokens: [],
  }).state,
  'live'
);

assert.strictEqual(
  typeof pluginOauth.protectedResourceMetadata,
  'function'
);
assert.strictEqual(
  typeof pluginOauth.authorizationServerMetadata,
  'function'
);

(async () => {
  const dns = await callTool('verify_supplier', { method: 'dns', domain: 'example.com' });
  assert.strictEqual(dns.supported, false);
  assert.strictEqual(dns.ok, false);

  const serverJs = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
  assert.ok(serverJs.includes('AIRSUPDEV-BEGIN'));
  assert.ok(serverJs.includes('oauth-protected-resource/airsupdev/mcp'));
  assert.ok(serverJs.includes('oauth-authorization-server/airsupdev/oauth'));
  const vercel = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
  assert.ok(vercel.includes('airsupdev/**'));
  const routes = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
  assert.ok(routes.includes('/connect'));
  assert.ok(routes.includes('/auth/google'));
  assert.ok(routes.includes('/oauth/authorize'));
  assert.strictEqual(require('./config').MCP_URL, 'https://www.tademehl.com/airsupdev/mcp');
  assert.strictEqual(require('../airsup/config').MCP_URL, 'https://www.tademehl.com/airsup/mcp');
  const mcpSrc = fs.readFileSync(path.join(__dirname, 'mcp.js'), 'utf8');
  assert.ok(mcpSrc.includes('Google OAuth'));
  assert.ok(!mcpSrc.includes('AIRSUPDEV_MCP_SECRET'));
  const servicesSrc = fs.readFileSync(path.join(__dirname, 'services.js'), 'utf8');
  assert.ok(servicesSrc.includes('chinaVerifyUrl'));
  assert.ok(servicesSrc.includes('chinaLiveJsonUrl'));
  assert.ok(!servicesSrc.includes('/airsup/china/verify'));
  assert.ok(fs.existsSync(path.join(__dirname, 'sql/schema.sql')));

  console.log('airsupdev tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
