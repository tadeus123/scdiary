const assert = require('assert');
const { domainMatches, normalizeDomain } = require('./domain');
const { proofLines, proofPayload, industryPeers } = require('./proof');
const { canPublish, normalizeProfile, mapCityId, fillEmptyCompany, listedContacts } = require('./fields');
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

const payload = proofPayload([{ status: 'pending' }, { status: 'live', live_at: 'x', verified_at: 'x', domain: 'acme.com' }]);
assert.strictEqual(payload.started, 2);
assert.strictEqual(payload.live, 1);
assert.strictEqual(payload.recent[0].domain, 'acme.com');
assert.deepStrictEqual(industryPeers(payload.recent, { niche: 'cnc', domain: 'acme.com' }), []);
assert.strictEqual(industryPeers([
  { domain: 'peer.com', niche: 'injection' },
  { domain: 'me.com', niche: 'injection' },
], { niche: 'injection', domain: 'me.com' })[0].domain, 'peer.com');

assert.strictEqual(canPublish({
  company_name: '深圳某某精密',
  city: 'shenzhen',
  profile: normalizeProfile({ processes: ['5axis'] }),
  goal: 'answer RFQs',
}), true);
assert.strictEqual(canPublish({ company_name: 'x', city: 'shenzhen', profile: {}, goal: '' }), false);

assert.strictEqual(mapCityId('Dongguan, China'), 'dongguan');
assert.strictEqual(mapCityId('深圳市南山区'), 'shenzhen');
assert.strictEqual(mapCityId('Ningbo'), 'other');
const filled = fillEmptyCompany(
  { company_name: '', profile: {} },
  { company_name: '深圳某某', city: 'dongguan', profile: { processes: ['5axis'], site_notes: 'scraped about page' } }
);
assert.strictEqual(filled.company_name, '深圳某某');
assert.ok(filled.profile.processes.includes('5axis'));
assert.ok(filled.profile.site_notes.includes('scraped'));
const firstCity = fillEmptyCompany(
  { city: 'shenzhen', niche: 'cnc', profile: {} },
  { city: 'dongguan', niche: 'injection', profile: { site_notes: 'x', processes: ['injection'] } }
);
assert.strictEqual(firstCity.city, 'dongguan');
assert.strictEqual(firstCity.niche, 'injection');
const keptCity = fillEmptyCompany(
  { city: 'dongguan', niche: 'cnc', profile: {} },
  { city: 'shenzhen', niche: 'injection', profile: { site_notes: 'x', processes: ['injection'] } }
);
assert.strictEqual(keptCity.city, 'dongguan');
assert.strictEqual(keptCity.niche, 'injection');
const withChat = normalizeProfile({
  contacts: [{ name: 'Li', wechat: 'wxid_li' }],
  sample_lead: 'samples in 7 days',
  flexibility: 'creative',
});
assert.strictEqual(listedContacts(withChat.contacts)[0].wechat, 'wxid_li');

const mail = verifyMail({ lang: 'zh', link: 'https://www.tademehl.com/airsup/china/verify?token=abc', contactName: '张工' });
assert.ok(mail.subject.includes('确认'));
assert.ok(mail.text.includes('https://www.tademehl.com/airsup/china/verify?token=abc'));
assert.ok(mail.html.includes('张工'));

const { COPY } = require('./i18n');
const { genericDemo, personalizedDemo, guessNiche } = require('./demo');
const { isBlockedHost, isPrivateIp, stripHtml, extraPathsFromHtml, companyDraftFromPreview } = require('./site-preview');
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
assert.ok(extraPathsFromHtml('<a href="/about">x</a><a href="https://acme.com/contact">y</a>', 'acme.com').length >= 1);
const siteDraft = companyDraftFromPreview({
  companyNameZh: '某某精密',
  companyNameEn: 'Acme',
  city: 'Dongguan',
  cityId: 'dongguan',
  niche: 'cnc',
  summary: '5-axis aluminum',
  profile: { processes: ['5axis'] },
});
assert.strictEqual(siteDraft.city, 'dongguan');
assert.ok(siteDraft.profile.processes.includes('5axis'));
assert.ok(COPY.zh.found_title.includes('网站'));
assert.ok(COPY.en.wechat_title.toLowerCase().includes('wechat'));
assert.ok(COPY.zh.holidays_label.includes('放假'));
assert.ok(COPY.en.peers_industry.toLowerCase().includes('industry'));

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
  completeReply,
  systemPrompt,
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

const laterDate = extractRfqFromText('Need 10 pieces 7075 aluminum, ship to Germany within 3 weeks, STEP attached');
assert.strictEqual(laterDate.destination, 'Germany');
assert.ok(/3 weeks/i.test(laterDate.target_date));
assert.ok(/7075/i.test(laterDate.material));
const kept = mergeRfq(
  { destination: 'Germany', target_date: 'within 3 weeks', quantity: '10 pieces', material: '7075' },
  { destination: 'unknown', target_date: '', quantity: '10 pieces', material: '7075' }
);
assert.strictEqual(kept.destination, 'Germany');
assert.strictEqual(kept.target_date, 'within 3 weeks');

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
assert.ok(fallbackReply({
  company: { ...factory, profile: { ...factory.profile, holidays: 'CNY shutdown' } },
  message: 'Can you mill this?',
  rfq: {},
}).includes('CNY shutdown'));
assert.ok(systemPrompt(factory).includes('make this company money'));
assert.ok(systemPrompt(factory).includes('5-axis aluminum brackets'));
assert.ok(systemPrompt(factory).includes('Keep every RFQ field'));
assert.ok(systemPrompt({
  ...factory,
  profile: { ...factory.profile, contacts: [{ name: 'Li', wechat: 'wxid_li' }], sample_lead: 'samples in 7 days', flexibility: 'creative' },
}).includes('wxid_li'));
assert.ok(systemPrompt({
  ...factory,
  profile: { ...factory.profile, sample_lead: 'samples in 7 days', flexibility: 'creative', holidays: 'CNY shutdown' },
}).includes('samples in 7 days'));
assert.ok(systemPrompt({
  ...factory,
  profile: { holidays: 'CNY shutdown' },
}).includes('CNY shutdown'));
assert.ok(systemPrompt(factory).includes('No generic capability dump'));
assert.ok(fallbackReply({
  company: factory,
  message: 'Also anodize them.',
  rfq: { quantity: '10 pieces', material: '7075', destination: 'Germany', target_date: 'within 3 weeks' },
  history: [{ role: 'buyer', body: 'Need 10 pieces' }],
}).includes('Germany'));
assert.ok(!fallbackReply({
  company: factory,
  message: 'Also anodize them.',
  rfq: { quantity: '10 pieces', destination: 'Germany' },
  history: [{ role: 'buyer', body: 'Need 10 pieces' }],
}).includes('Processes:'));

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
    sendFactoryNotice: async (payload) => { notices.push(payload); },
  };
  let seenHistory = null;
  deps.completeReply = async ({ message, history }) => {
    seenHistory = history;
    return {
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
    };
  };
  const first = await maybeHandle(caller, { person_id: factory.company_id, message: 'Can you make 500 aluminum brackets?' }, deps);
  assert.ok(first.conversation_id.startsWith(CONV_PREFIX));
  assert.strictEqual(first.status, 'replied');
  assert.ok(first.reply.includes('500 aluminum'));
  assert.strictEqual(notices.length, 1);
  assert.ok(Array.isArray(first._panel && first._panel.messages));
  assert.strictEqual(first._panel.messages.length, 2);
  assert.strictEqual(first._panel.messages[0].from, 'you');
  assert.strictEqual(first._panel.messages[1].from, 'them');
  assert.deepStrictEqual(seenHistory, []);

  const { formatToolResult, formatWidgetResult } = require('../mcp');
  const { WIDGET_URI } = require('../widget');
  const publicFirst = formatToolResult(first);
  assert.deepStrictEqual(Object.keys(publicFirst.structuredContent).sort(), ['conversation_id', 'reply', 'status']);
  assert.ok(!Object.prototype.hasOwnProperty.call(publicFirst.structuredContent, '_panel'));
  const widgeted = await formatWidgetResult(null, caller, first, { args: { person_id: factory.company_id } });
  assert.strictEqual(widgeted._meta.ui.panel.messages.length, 2);
  assert.ok(!widgeted.structuredContent._panel);
  assert.ok(widgeted.content[0].text.includes(first.conversation_id));
  assert.ok(!widgeted.content[0].text.includes(first.reply));
  assert.ok(!widgeted.content[0].text.startsWith('{'));
  assert.strictEqual(widgeted._meta['openai/outputTemplate'], WIDGET_URI);
  assert.strictEqual(widgeted._meta['openai/resultCanProduceWidget'], true);
  const replyOnly = await formatWidgetResult(null, caller, {
    conversation_id: first.conversation_id,
    status: 'replied',
    reply: first.reply,
  });
  assert.ok(replyOnly._meta.ui.panel.messages.some((row) => row.from === 'them' && row.body === first.reply));

  const second = await maybeHandle(caller, { conversation_id: first.conversation_id, message: 'Also anodize them.' }, deps);
  assert.strictEqual(second.conversation_id, first.conversation_id);
  assert.ok(second.reply.includes('anodize'));
  assert.strictEqual(notices.length, 1);
  assert.strictEqual((seenHistory || []).length, 2);
  assert.strictEqual(second._panel.messages.length, 4);
  const continued = await formatWidgetResult(null, caller, second, { args: { conversation_id: first.conversation_id } });
  assert.strictEqual(continued._meta['openai/resultCanProduceWidget'], false);
  assert.strictEqual(continued._meta['openai/outputTemplate'], undefined);

  const panel = await conversationPanel(caller, first.conversation_id, deps);
  assert.strictEqual(panel.other.name, 'Acme CNC');
  assert.strictEqual(panel.messages.length, 4);
  assert.strictEqual(panel.messages[0].from, 'you');
  assert.strictEqual(panel.messages[1].from, 'them');

  const skipped = await maybeHandle(caller, { person_id: 'not-a-company', message: 'hello' }, deps);
  assert.strictEqual(skipped, null);
  const peopleId = await maybeHandle(caller, { conversation_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', message: 'hello' }, deps);
  assert.strictEqual(peopleId, null);

  const boomStore = memoryChina([factory]);
  boomStore.insertMessage = async () => { throw new Error('db down'); };
  const boom = await maybeHandle(caller, { person_id: factory.company_id, message: 'hello' }, {
    db: boomStore,
    completeReply: deps.completeReply,
    sendFactoryNotice: deps.sendFactoryNotice,
  });
  assert.strictEqual(boom.status, 'failed');

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
  assert.ok(Array.isArray(paused._panel && paused._panel.messages));
  assert.ok(paused._panel.messages.some((row) => row.from === 'them'));
  const pausedWidget = await formatWidgetResult(null, caller, paused);
  assert.ok(pausedWidget._meta.ui.panel.messages.some((row) => row.from === 'them' && row.body === paused.reply));

  const ai = await completeReply({
    company: factory,
    caller,
    history: [{ role: 'buyer', body: 'Can you mill brackets?' }, { role: 'factory', body: 'Yes, 5-axis aluminum.' }],
    message: 'Need 200 pcs to Germany',
    rfq: {},
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.model, 'gpt-4o-mini');
      assert.ok(body.messages[0].content.includes('Acme CNC'));
      assert.strictEqual(body.messages[1].role, 'user');
      assert.strictEqual(body.messages[2].role, 'assistant');
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  reply: 'We can mill 200 aluminum brackets for Germany. Send STEP plus tolerance.',
                  rfq: { quantity: '200 pcs', material: 'aluminum', destination: 'Germany' },
                  rfq_complete: false,
                  notify_factory: false,
                  notify_reason: 'none',
                }),
              },
            }],
          };
        },
      };
    },
  });
  assert.ok(ai.reply.includes('200 aluminum'));

  const mixed = await completeReply({
    company: factory,
    caller: { person_id: 'tade', display_name: 'Anna Schmidt', email: 'tademehl@gmail.com' },
    history: [],
    message: 'Can you mill this?',
    rfq: {},
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      const user = body.messages[body.messages.length - 1].content;
      assert.ok(user.includes('tademehl@gmail.com'));
      assert.ok(!user.includes('Anna Schmidt'));
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  reply: 'Yes, we mill that.',
                  rfq: {},
                  rfq_complete: false,
                  notify_factory: false,
                  notify_reason: 'none',
                }),
              },
            }],
          };
        },
      };
    },
  });
  assert.ok(mixed.reply.includes('mill'));

  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const fallbackAi = await completeReply({
      company: factory,
      history: [],
      message: 'Can you mill this?',
      rfq: {},
    });
    assert.ok(fallbackAi.reply.includes('Acme CNC'));
  } finally {
    if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
  }

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
