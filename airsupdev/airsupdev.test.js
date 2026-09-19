const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createMcp } = require('./mcp');
const { deriveOnboardingStatus, timingSafeEqualString, callTool } = require('./services');
const { isEmailAllowed, allowedEmails } = require('./config');
const auth = require('./auth');
const pluginOauth = require('./oauth-plugin');
const facts = require('../airsup/china/facts');

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
  'record_email_bounce',
  'record_supplier_reply',
  'get_supplier_data_depth',
  'get_supplier_fact_gaps',
  'list_supplier_facts',
];

for (const name of TOOL_NAMES) {
  const file = path.join(__dirname, 'tools', `${name}.json`);
  assert.ok(fs.existsSync(file), `missing tool schema ${name}`);
  const tool = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(tool.name, name);
}

const mcp = createMcp();
assert.deepStrictEqual(mcp.TOOL_FILES, TOOL_NAMES);
assert.strictEqual(mcp.toolList().tools.length, 19);

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

const opened = deriveOnboardingStatus({
  company: { status: 'pending', company_name_en: 'Superb Tech', city: 'shenzhen', goal: 'g', profile: {} },
  allow: { claim_opened_at: '2026-09-18T16:07:08.000Z' },
  tokens: [],
});
assert.strictEqual(opened.state, 'claim_page_viewed');
assert.strictEqual(opened.funnel_state, 'claim_page_viewed');
assert.strictEqual(opened.inbox_owned, false);
assert.strictEqual(opened.opened_is_not_verified, true);
assert.strictEqual(opened.company_status, 'pending');
assert.deepStrictEqual(opened.publish_gaps, ['capabilities']);
assert.ok(opened.reason.includes('capabilities'));

assert.strictEqual(
  deriveOnboardingStatus({
    company: {
      status: 'verified',
      verified_at: '2026-09-19T00:00:00.000Z',
      company_name_en: 'Superb Tech',
      city: 'shenzhen',
      goal: 'g',
      profile: {},
    },
    allow: { claim_opened_at: '2026-09-18T16:07:08.000Z' },
    tokens: [],
  }).state,
  'email_verified'
);

assert.strictEqual(facts.depthTier(12), 'seed');
assert.strictEqual(facts.depthTier(120), 'enriched');
assert.strictEqual(facts.depthTier(800), 'deep');
assert.ok(facts.factsFromCompany({
  domain: 'acme.com',
  company_name_en: 'Acme',
  city: 'shenzhen',
  niche: 'pcba',
  profile: { processes: ['smt'], machines: 'Yamaha YSM20' },
}).length >= 5);
assert.ok(facts.factsFromReplyText('MOQ 50, lead 12 days, we do PCBA').some((row) => row.fact_key === 'reply.moq'));

assert.strictEqual(
  typeof pluginOauth.protectedResourceMetadata,
  'function'
);
assert.strictEqual(
  typeof pluginOauth.authorizationServerMetadata,
  'function'
);

assert.ok(fs.existsSync(path.join(__dirname, 'tools/get_supplier_data_depth.json')));
assert.ok(fs.readFileSync(path.join(__dirname, 'services.js'), 'utf8').includes('facts_store'));
assert.ok(fs.readFileSync(path.join(__dirname, 'services.js'), 'utf8').includes('listFunnelEvents'));
assert.ok(fs.readFileSync(path.join(__dirname, '../airsup/china/sql/schema.sql'), 'utf8').includes('airsup_china_facts'));
assert.ok(fs.readFileSync(path.join(__dirname, '../airsup/china/sql/schema.sql'), 'utf8').includes("default 'other'"));
assert.ok(fs.readFileSync(path.join(__dirname, '../airsup/china/routes.js'), 'utf8').includes('peekVerifyToken'));
assert.ok(!fs.readFileSync(path.join(__dirname, '../airsup/china/routes.js'), 'utf8').includes("claim_opened_at: new Date"));
assert.ok(fs.existsSync(path.join(__dirname, '../airsup/china/verify-token.js')));
assert.ok(fs.existsSync(path.join(__dirname, '../airsup/china/views/verify.ejs')));

(async () => {
  const dns = await callTool('verify_supplier', { method: 'dns', domain: 'example.com' });
  assert.strictEqual(dns.supported, false);
  assert.strictEqual(dns.ok, false);

  const serverJs = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
  assert.ok(serverJs.includes('AIRSUPDEV-BEGIN'));
  assert.ok(serverJs.includes('oauth-protected-resource/airsupdev/mcp'));
  assert.ok(serverJs.includes('oauth-authorization-server/airsupdev/oauth'));
  assert.ok(serverJs.includes("'/tademehl/airsup/china'"));
  assert.ok(serverJs.includes('? 302 : 307'));
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
  const i18n = fs.readFileSync(path.join(__dirname, '../airsup/china/i18n.js'), 'utf8');
  assert.ok(i18n.includes('Hellerhofstr. 17, 01129 Dresden'));
  assert.ok(!i18n.includes('Sebnitzer'));

  console.log('airsupdev tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
