const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createMcp } = require('./mcp');
const { deriveOnboardingStatus, timingSafeEqualString, callTool } = require('./services');

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
assert.strictEqual(mcp.toolList().tools.length, 12);

assert.strictEqual(timingSafeEqualString('abc', 'abc'), true);
assert.strictEqual(timingSafeEqualString('abc', 'abd'), false);
assert.strictEqual(timingSafeEqualString('abc', 'ab'), false);
assert.strictEqual(timingSafeEqualString('', 'x'), false);

assert.strictEqual(
  deriveOnboardingStatus({
    company: { status: 'live', company_name: 'x', city: 'shenzhen', goal: 'g', profile: { processes: ['cnc'] } },
    allow: null,
    tokens: [],
  }).state,
  'live'
);

assert.strictEqual(
  deriveOnboardingStatus({
    company: {
      status: 'verified',
      company_name: '深圳厂',
      city: 'dongguan',
      goal: 'RFQs',
      profile: { processes: ['injection'] },
      context: '',
    },
    allow: null,
    tokens: [],
  }).state,
  'ready_to_publish'
);

assert.strictEqual(
  deriveOnboardingStatus({
    company: { status: 'pending', company_name: '', city: '', goal: '', profile: {} },
    allow: null,
    tokens: [{ purpose: 'claim', used_at: null, expires_at: new Date(Date.now() + 3600000).toISOString() }],
  }).state,
  'magic_link_created'
);

assert.strictEqual(
  deriveOnboardingStatus({
    company: { status: 'pending', company_name: '', city: '', goal: '', profile: {} },
    allow: { claim_opened_at: new Date().toISOString() },
    tokens: [],
  }).state,
  'opened'
);

assert.strictEqual(
  deriveOnboardingStatus({ company: null, allow: null, tokens: [] }).state,
  'blocked'
);

(async () => {
  const dns = await callTool('verify_supplier', { method: 'dns', domain: 'example.com' });
  assert.strictEqual(dns.supported, false);
  assert.strictEqual(dns.ok, false);

  const serverJs = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
  assert.ok(serverJs.includes('AIRSUPDEV-BEGIN'));
  assert.ok(serverJs.includes("require('../airsupdev/routes')"));
  const vercel = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
  assert.ok(vercel.includes('airsupdev/**'));
  const services = fs.readFileSync(path.join(__dirname, 'services.js'), 'utf8');
  assert.ok(services.includes('live_locked'));
  assert.ok(services.includes('confirm_required'));
  assert.ok(services.includes('allowFuzzy'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'tools/verify_supplier.json'), 'utf8').includes('confirm'));

  console.log('airsupdev tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
