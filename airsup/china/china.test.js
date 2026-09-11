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
assert.ok(empty.en.includes('first export factories'));
assert.ok(empty.zh.includes('第一批'));

const talking = proofLines({ started: 4, verified: 1, live: 0 });
assert.ok(talking.en.includes('4 export suppliers'));
assert.ok(!talking.en.includes('90%'));

const connected = proofLines({ started: 20, verified: 12, live: 8 });
assert.ok(connected.en.startsWith('12 verified'));

const dense = proofLines({ started: 80, verified: 70, live: 63 });
assert.ok(dense.en.includes('63 verified export manufacturers'));

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

const { COPY } = require('./i18n');
const { genericDemo, personalizedDemo, guessNiche } = require('./demo');
const { isBlockedHost, isPrivateIp, stripHtml } = require('./site-preview');
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
for (const lang of Object.keys(COPY)) {
  for (const [key, value] of Object.entries(COPY[lang])) {
    assert.ok(!emoji.test(String(value)), `emoji in ${lang}.${key}`);
  }
}
assert.ok(COPY.zh.hero.includes('ChatGPT'));
assert.ok(COPY.zh.price.includes('免费'));
assert.ok(COPY.en.price.toLowerCase().includes('free for suppliers'));
assert.ok(COPY.zh.sim_badge.includes('模拟'));
assert.ok(COPY.en.sim_badge.toLowerCase().includes('simulation'));
assert.ok(!emoji.test(JSON.stringify(genericDemo('zh'))));
assert.ok(!emoji.test(JSON.stringify(genericDemo('en'))));

const demo = genericDemo('en');
assert.ok(demo.chatgptBuyer.toLowerCase().includes('dongguan'));
assert.strictEqual(demo.agents.length, 4);
const own = personalizedDemo('en', { domain: 'acme-mold.com', companyName: 'Acme Mold', city: 'Dongguan', niche: 'injection' });
assert.ok(own.suppliers[0].name.includes('Acme Mold'));
assert.strictEqual(guessNiche('PA66 injection molding 注塑'), 'injection');
assert.strictEqual(isBlockedHost('localhost'), true);
assert.strictEqual(isPrivateIp('127.0.0.1'), true);
assert.ok(stripHtml('<title>Hi</title><p>Factory</p>').includes('Factory'));

const crypto = require('crypto');
const {
  maybeHandle,
  maybeEnd,
  CONV_PREFIX,
  conversationPanel,
} = require('./talk');
const {
  isRfqComplete,
  extractRfqFromText,
  mergeRfq,
  fallbackReply,
  normalizeOutcome,
} = require('./reply');
const { factoryNoticeMail } = require('./mail');

const extracted = extractRfqFromText('Need 500 pcs aluminum 6061, ±0.02 mm, anodized, to Germany by 2026-11-01, STEP file attached');
assert.ok(extracted.quantity.includes('500'));
assert.ok(/aluminum|6061/i.test(extracted.material));
assert.ok(extracted.destination);
assert.ok(extracted.drawings);
assert.strictEqual(isRfqComplete(mergeRfq(extracted, {
  quantity: '500 pcs',
  material: 'aluminum',
  tolerance: '±0.02 mm',
  target_date: '2026-11-01',
  destination: 'Germany',
})), true);
assert.strictEqual(isRfqComplete({ quantity: '1', material: 'alu', tolerance: '', finish: '', target_date: '', destination: '' }), false);

const factory = {
  company_id: '11111111-1111-1111-1111-111111111111',
  domain: 'acme-cnc.com',
  company_name: '深圳某某精密',
  company_name_en: 'Acme CNC',
  city: 'shenzhen',
  contact_email: 'sales@acme-cnc.com',
  contact_name: 'Li',
  locale: 'zh',
  niche: 'cnc',
  status: 'live',
  context: '5-axis aluminum brackets',
  goal: 'Collect RFQs for CNC parts',
  profile: { processes: ['5axis'], materials: ['alu'] },
  actions: ['answer_capabilities', 'collect_rfq', 'request_missing', 'forward_sales'],
};
assert.ok(fallbackReply({ company: factory, message: 'Can you mill this?', rfq: {} }).includes('Acme CNC'));
assert.ok(!fallbackReply({ company: factory, message: 'Can you mill this?', rfq: {} }).includes('How to answer'));

const notice = factoryNoticeMail({
  lang: 'zh',
  company: factory,
  callerName: 'Ada Buyer',
  message: 'Need a quote',
  reply: 'Please send qty and material.',
  rfq: { quantity: '500 pcs', material: 'aluminum' },
  reason: 'rfq',
});
assert.ok(notice.subject.includes('询盘') || notice.subject.toLowerCase().includes('inquiry'));
assert.ok(notice.text.includes('500 pcs'));
assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(notice.subject + notice.text));

function memoryChina(companies) {
  const byId = new Map(companies.map((row) => [row.company_id, { ...row }]));
  const threads = new Map();
  const messages = [];
  return {
    isConfigured: () => true,
    async getById(id) { return byId.get(id) || null; },
    async insertThread(row) {
      const conversation_id = crypto.randomUUID();
      const rec = {
        notify_reasons: [],
        rfq: {},
        status: 'open',
        ...row,
        conversation_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      threads.set(conversation_id, rec);
      return { ...rec };
    },
    async getThread(id) {
      const row = threads.get(id);
      return row ? { ...row } : null;
    },
    async findOpenThread(companyId, callerPersonId) {
      for (const row of threads.values()) {
        if (row.company_id === companyId && row.caller_person_id === callerPersonId && row.status === 'open') {
          return { ...row };
        }
      }
      return null;
    },
    async listThreadsForCaller(callerPersonId) {
      return [...threads.values()].filter((row) => row.caller_person_id === callerPersonId).map((row) => ({ ...row }));
    },
    async updateThread(id, patch) {
      const current = threads.get(id);
      const row = { ...current, ...patch, updated_at: new Date().toISOString() };
      threads.set(id, row);
      return { ...row };
    },
    async insertMessage(row) {
      const rec = { message_id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
      messages.push(rec);
      return rec;
    },
    async listMessages(conversationId) {
      return messages.filter((row) => row.conversation_id === conversationId).map((row) => ({ ...row }));
    },
    async insertInquiry() { return {}; },
  };
}

(async () => {
  const store = memoryChina([factory]);
  const caller = { person_id: 'buyer-1', display_name: 'Ada', email: 'ada@example.com' };
  const notices = [];
  const deps = {
    db: store,
    completeReply: async ({ message }) => ({
      reply: `Endpoint reply to: ${message}`,
      rfq: {
        quantity: '500 pcs',
        material: 'aluminum',
        tolerance: '±0.02 mm',
        target_date: '2026-11-01',
        destination: 'Germany',
        drawings: 'STEP',
        notes: '',
      },
      rfq_complete: true,
      notify_factory: true,
      notify_reason: 'rfq',
    }),
    sendFactoryNotice: async (payload) => { notices.push(payload); },
  };
  const first = await maybeHandle(caller, { person_id: factory.company_id, message: 'Can you make 500 aluminum brackets?' }, deps);
  assert.ok(first.conversation_id.startsWith(CONV_PREFIX));
  assert.strictEqual(first.status, 'replied');
  assert.ok(first.reply.includes('500 aluminum'));
  assert.strictEqual(notices.length, 1);

  const second = await maybeHandle(caller, { conversation_id: first.conversation_id, message: 'Also anodize them.' }, deps);
  assert.strictEqual(second.conversation_id, first.conversation_id);
  assert.ok(second.reply.includes('anodize'));
  assert.strictEqual(notices.length, 1);

  const panel = await conversationPanel(caller, first.conversation_id, deps);
  assert.strictEqual(panel.other.name, 'Acme CNC');
  assert.strictEqual(panel.messages.length, 4);
  assert.strictEqual(panel.messages[0].from, 'you');
  assert.strictEqual(panel.messages[1].from, 'them');

  const skipped = await maybeHandle(caller, { person_id: 'not-a-company', message: 'hello' }, deps);
  assert.strictEqual(skipped, null);

  const both = await maybeHandle(caller, {
    person_id: factory.company_id,
    conversation_id: first.conversation_id,
    message: 'Need 200 pcs more.',
  }, deps);
  assert.strictEqual(both.status, 'replied');
  assert.strictEqual(both.conversation_id, first.conversation_id);
  assert.ok(both.reply.includes('200 pcs'));

  const ended = await maybeEnd(caller, first.conversation_id, deps);
  assert.strictEqual(ended.status, 'ended');
  const afterEnd = await maybeHandle(caller, { conversation_id: first.conversation_id, message: 'still there?' }, deps);
  assert.strictEqual(afterEnd.status, 'failed');

  const pausedStore = memoryChina([{ ...factory, status: 'verified' }]);
  const paused = await maybeHandle(caller, { person_id: factory.company_id, message: 'hello' }, { db: pausedStore, completeReply: deps.completeReply, sendFactoryNotice: deps.sendFactoryNotice });
  assert.strictEqual(paused.status, 'replied');
  assert.ok(paused.reply.toLowerCase().includes('paused'));

  const outcome = normalizeOutcome({
    reply: 'We can mill that.',
    rfq: { quantity: '10', material: 'alu', tolerance: '±0.05', target_date: 'May', destination: 'USA' },
    rfq_complete: true,
    notify_factory: true,
    notify_reason: 'rfq',
  }, { reply: 'fallback', rfq: {}, actions: factory.actions });
  assert.strictEqual(outcome.notify_reason, 'rfq');
  assert.strictEqual(outcome.rfq_complete, true);

  console.log('airsup china tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
