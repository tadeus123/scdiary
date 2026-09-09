const assert = require('assert');
const { domainMatches, normalizeDomain } = require('./domain');
const { proofLines, proofPayload } = require('./proof');
const { canPublish, normalizeProfile } = require('./fields');
const { verifyMail } = require('./mail');

assert.strictEqual(normalizeDomain('https://www.WayKenRM.com/cnc'), 'waykenrm.com');
assert.strictEqual(domainMatches('https://www.waykenrm.com', 'sales@waykenrm.com').ok, true);
assert.strictEqual(domainMatches('waykenrm.com', 'sales@mail.waykenrm.com').ok, true);
assert.strictEqual(domainMatches('waykenrm.com', 'sales@gmail.com').error, 'free_mail');
assert.strictEqual(domainMatches('waykenrm.com', 'sales@other.com').error, 'mismatch');
assert.strictEqual(domainMatches('gmail.com', 'a@gmail.com').error, 'website_public');

const empty = proofLines({ started: 0, verified: 0, live: 0 });
assert.ok(empty.en.includes('first group'));
assert.ok(empty.zh.includes('第一批'));

const talking = proofLines({ started: 4, verified: 1, live: 0 });
assert.ok(talking.en.includes('4 CNC suppliers'));
assert.ok(!talking.en.includes('90%'));

const connected = proofLines({ started: 20, verified: 12, live: 8 });
assert.ok(connected.en.startsWith('12 verified'));

const dense = proofLines({ started: 80, verified: 70, live: 63 });
assert.ok(dense.en.includes('63 verified CNC manufacturers'));

const payload = proofPayload([{ status: 'pending' }, { status: 'live', live_at: 'x', verified_at: 'x' }]);
assert.strictEqual(payload.started, 2);
assert.strictEqual(payload.live, 1);

assert.strictEqual(canPublish({
  company_name: '深圳某某精密',
  city: 'shenzhen',
  profile: normalizeProfile({ processes: ['5axis'] }),
  goal: 'answer RFQs',
}), true);
assert.strictEqual(canPublish({ company_name: 'x', city: 'shenzhen', profile: {}, goal: '' }), false);

const mail = verifyMail({ lang: 'zh', link: 'https://www.tademehl.com/airsup/china/verify?token=abc', contactName: '张工' });
assert.ok(mail.subject.includes('确认'));
assert.ok(mail.text.includes('https://www.tademehl.com/airsup/china/verify?token=abc'));
assert.ok(mail.html.includes('张工'));

console.log('airsup china tests passed');
