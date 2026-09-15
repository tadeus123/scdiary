const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { domainMatches, emailAllowedForSite, normalizeDomain } = require('./domain');
const { proofLines, proofPayload, industryPeers, liveSeries, formatChartDay, chartFromSeries, liveRoster, liveCompanies } = require('./proof');
const { canPublish, normalizeProfile, mapCityId, fillEmptyCompany, listedContacts, buyerTestPrompt } = require('./fields');
const { extractSiteEmails } = require('./site-preview');
const { verifyMail } = require('./mail');

assert.strictEqual(normalizeDomain('https://www.WayKenRM.com/cnc'), 'waykenrm.com');
assert.strictEqual(domainMatches('https://www.waykenrm.com', 'sales@waykenrm.com').ok, true);
assert.strictEqual(domainMatches('waykenrm.com', 'sales@mail.waykenrm.com').ok, true);
assert.strictEqual(domainMatches('waykenrm.com', 'sales@gmail.com').error, 'free_mail');
assert.strictEqual(domainMatches('waykenrm.com', 'sales@other.com').error, 'mismatch');
assert.strictEqual(domainMatches('gmail.com', 'a@gmail.com').error, 'website_public');
assert.strictEqual(emailAllowedForSite({
  website: 'lk-moulds.com',
  email: 'sales@group-trade.cn',
  siteEmails: [],
}).error, 'mismatch');
assert.strictEqual(emailAllowedForSite({
  website: 'lk-moulds.com',
  email: 'sales@group-trade.cn',
  siteEmails: ['sales@group-trade.cn'],
}).ok, true);
assert.strictEqual(emailAllowedForSite({
  website: 'lk-moulds.com',
  email: 'sales@group-trade.cn',
  siteEmails: ['sales@group-trade.cn'],
}).reason, 'site_contact');
assert.strictEqual(emailAllowedForSite({
  website: 'lk-moulds.com',
  email: 'boss@gmail.com',
  siteEmails: ['boss@gmail.com'],
}).error, 'free_mail');
assert.deepStrictEqual(
  extractSiteEmails('Contact <a href="mailto:Info@Factory-CN.com">mail</a>', 'Also sales@partner-export.com and junk@gmail.com'),
  ['info@factory-cn.com', 'sales@partner-export.com']
);
assert.ok(fs.readFileSync(path.join(__dirname, 'sql/schema.sql'), 'utf8').includes('airsup_china_domain_allows'));
assert.ok(fs.readFileSync(path.join(__dirname, 'sql/schema.sql'), 'utf8').includes("'claim'"));
assert.ok(fs.readFileSync(path.join(__dirname, 'sql/domain-allows.sql'), 'utf8').includes('airsup_china_domain_allows'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/claim.ejs'), 'utf8').includes('claim_publish'));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("router.get('/claim'"));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("router.post('/claim/confirm'"));
assert.ok(fs.readFileSync(path.join(__dirname, 'mint-claim.js'), 'utf8').includes('mintClaim'));
assert.strictEqual(typeof require('./mint-claim').mintClaim, 'function');
assert.ok(fs.readFileSync(path.join(__dirname, 'approve-claim.js'), 'utf8').includes("source: 'manual'"));
assert.ok(fs.readFileSync(path.join(__dirname, 'funnel-status.js'), 'utf8').includes('allows_claim_opened'));
assert.ok(fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8').includes('listDomainAllows'));

const empty = proofLines({ started: 0, verified: 0, live: 0 });
assert.ok(empty.en.includes('first export factories'));
assert.ok(empty.zh.includes('第一批'));

const talking = proofLines({ started: 4, verified: 1, live: 0 });
assert.ok(talking.en.includes('4 export suppliers'));
assert.ok(!talking.en.includes('90%'));

const connected = proofLines({ started: 20, verified: 12, live: 8 });
assert.ok(connected.en.includes('8 Chinese factories'));
assert.ok(connected.zh.includes('8 家'));
assert.ok(!connected.en.startsWith('12 verified'));

const verifiedOnly = proofLines({ started: 20, verified: 12, live: 0 });
assert.ok(verifiedOnly.en.startsWith('12 export manufacturers'));

const dense = proofLines({ started: 80, verified: 70, live: 63 });
assert.ok(dense.en.includes('63 Chinese factories'));
assert.ok(dense.zh.includes('63 家'));

const payload = proofPayload([{ status: 'pending' }, { status: 'live', live_at: '2026-09-11T04:00:00.000Z', verified_at: 'x', domain: 'acme.com', niche: 'cnc', company_name_en: 'Acme' }]);
assert.strictEqual(payload.started, 2);
assert.strictEqual(payload.live, 1);
assert.strictEqual(payload.recent[0].domain, 'acme.com');
assert.ok(payload.chart && payload.chart.line);
assert.ok(payload.chart.labels[0].first);
assert.deepStrictEqual(industryPeers(payload.recent, { niche: 'cnc', domain: 'acme.com' }), []);
assert.strictEqual(industryPeers([
  { domain: 'peer.com', niche: 'injection' },
  { domain: 'me.com', niche: 'injection' },
], { niche: 'injection', domain: 'me.com' })[0].domain, 'peer.com');
const grown = liveSeries([
  { status: 'live', live_at: '2026-09-11T02:00:00.000Z' },
  { status: 'live', live_at: '2026-09-11T08:00:00.000Z' },
  { status: 'live', live_at: '2026-09-12T02:00:00.000Z' },
], new Date('2026-09-12T08:00:00.000Z'));
assert.strictEqual(grown[0].count, 0);
assert.strictEqual(grown[1].count, 2);
assert.strictEqual(grown[1].day, grown[0].day);
assert.strictEqual(grown[grown.length - 1].count, 3);
assert.ok(formatChartDay(grown[0].day, 'zh').includes('月'));
const grownChart = chartFromSeries(grown);
assert.ok(grownChart.line.startsWith(`${grownChart.left},${grownChart.baseline}`));
const roster = liveRoster([
  { status: 'pending', domain: 'skip.com', live_at: '2026-09-11T04:00:00.000Z', company_name_en: 'Skip' },
  { status: 'live', live_at: '2026-09-11T04:00:00.000Z', domain: 'acme.com', niche: 'cnc', company_name_en: 'Acme', city: 'dongguan' },
]);
assert.strictEqual(roster.meaning, 'published_live_endpoint');
assert.strictEqual(roster.live, 1);
assert.strictEqual(roster.factories[0].domain, 'acme.com');
assert.strictEqual(roster.factories[0].status, 'live');
assert.ok(!JSON.stringify(roster).includes('wechat'));
const companies = liveCompanies([
  { status: 'pending', domain: 'skip.com', live_at: '2026-09-11T04:00:00.000Z', company_name_en: 'Skip' },
  { status: 'live', live_at: '2026-09-11T04:00:00.000Z', domain: 'acme.com', niche: 'cnc', company_name_en: 'Acme', city: 'dongguan' },
]);
assert.strictEqual(companies.length, 1);
assert.deepStrictEqual(companies[0], {
  name: 'Acme',
  domain: 'acme.com',
  category: 'CNC machining',
  live: true,
  activated_at: '2026-09-11T04:00:00.000Z',
});
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/head.ejs'), 'utf8').includes('/airsup/live-companies.json'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/head.ejs'), 'utf8').includes('/llms.txt'));
assert.ok(fs.existsSync(path.join(__dirname, '../public/china.txt')));
assert.ok(fs.readFileSync(path.join(__dirname, '../../public/robots.txt'), 'utf8').includes('ChatGPT-User'));
assert.ok(fs.readFileSync(path.join(__dirname, '../../public/robots.txt'), 'utf8').includes('OAI-SearchBot'));
assert.ok(fs.readFileSync(path.join(__dirname, '../../public/llms.txt'), 'utf8').includes('/airsup/live-companies.json'));
assert.ok(fs.readFileSync(path.join(__dirname, '../../server/utils/seo.js'), 'utf8').includes("'/airsup/china'"));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/diagram.ejs'), 'utf8').includes('cn-gpt-mark'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/diagram.ejs'), 'utf8').includes('stroke="currentColor"'));
assert.ok(!fs.readFileSync(path.join(__dirname, 'views/partials/diagram.ejs'), 'utf8').includes('M9 1.5l1.2 5.2'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/head.ejs'), 'utf8').includes('/airsup/china/live.json'));
assert.ok(fs.readFileSync(path.join(__dirname, '../routes.js'), 'utf8').includes("router.get('/live-companies.json'"));

assert.strictEqual(canPublish({
  company_name: '深圳某某精密',
  city: 'shenzhen',
  profile: normalizeProfile({ processes: ['5axis'] }),
  goal: 'answer RFQs',
}), true);
assert.strictEqual(canPublish({ company_name: 'x', city: 'shenzhen', profile: {}, goal: '' }), false);
assert.ok(buyerTestPrompt({
  niche: 'injection',
  city: 'dongguan',
  profile: normalizeProfile({ processes: ['injection'] }),
}).includes('Dongguan'));
assert.strictEqual(normalizeProfile({ claim_ready: true, processes: ['5axis'] }).claim_ready, true);
assert.strictEqual(normalizeProfile({ processes: ['5axis'] }).claim_ready, false);
assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('live-buyer-prompt'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('listingPreview'));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes('claim_ready'));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("purpose !== 'verify' &&"));
assert.ok(!fs.readFileSync(path.join(__dirname, 'mint-claim.js'), 'utf8').startsWith("require('dotenv')"));

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
const keepMachines = fillEmptyCompany(
  {
    company_name: 'Acme',
    city: 'dongguan',
    profile: {
      machines: 'DMG 5-axis',
      contacts: [{ name: 'Li', wechat: 'wxid_li' }],
      enrichment: { filled_at: '2020-01-01', sources: [{ field: 'machines', url: 'https://a.com', quote: 'old' }] },
    },
  },
  {
    profile: {
      machines: 'should not overwrite',
      contacts: [{ name: 'Other', wechat: 'other' }],
      enrichment: { filled_at: '2026-01-01', sources: [{ field: 'certifications', url: 'https://a.com/q', quote: 'ISO 9001' }] },
    },
  }
);
assert.strictEqual(keepMachines.profile.machines, 'DMG 5-axis');
assert.strictEqual(listedContacts(keepMachines.profile.contacts)[0].wechat, 'wxid_li');
assert.ok(keepMachines.profile.enrichment.sources.some((row) => row.field === 'machines'));
assert.ok(keepMachines.profile.enrichment.sources.some((row) => row.field === 'certifications'));
assert.ok(!JSON.stringify(require('./fields').endpointRecord(keepMachines)).includes('enrichment'));
const gapsEmpty = require('./fields').enrichmentGaps({ profile: {} });
assert.ok(gapsEmpty.some((gap) => gap.field === 'wechat'));
assert.ok(require('./fields').countFilledBuyerFields({ company_name: 'A', city: 'dongguan', profile: { machines: 'x' } }) >= 3);
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

const { COPY, t } = require('./i18n');
const { genericDemo, personalizedDemo, guessNiche } = require('./demo');
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const { isBlockedHost, isPrivateIp, stripHtml, extraPathsFromHtml, companyDraftFromPreview, heuristicHintsFromText, PAGE_BUDGET } = require('./site-preview');
assert.ok(PAGE_BUDGET >= 8);
const hints = heuristicHintsFromText('ISO 9001 certified 5-axis CNC aluminum machining 注塑');
assert.ok(hints.processes.includes('5axis'));
assert.ok(hints.processes.includes('injection'));
assert.ok(hints.materials.includes('alu'));
assert.ok(hints.certifications.includes('iso9001'));
assert.ok(extraPathsFromHtml('<a href="/equipment">x</a><a href="/quality/certificate">y</a><a href="https://evil.com/quality">z</a>', 'acme.com').length >= 2);
assert.ok(!extraPathsFromHtml('<a href="https://evil.com/quality">z</a>', 'acme.com').length);
const { confirmChecklist, gapEmailBody } = require('./enrich');
const checklist = confirmChecklist({
  profile: {
    enrichment: { sources: [{ field: 'machines', url: 'https://acme.com/eq', quote: '5-axis' }] },
  },
});
assert.ok(checklist.need.length >= 1);
assert.ok(!emoji.test(gapEmailBody({ domain: 'acme.com', company_name_en: 'Acme' })));
assert.ok(fs.existsSync(path.join(__dirname, 'enrich-company.js')));
assert.ok(fs.readFileSync(path.join(__dirname, 'enrich.js'), 'utf8').includes('fillEmptyCompany'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/setup.ejs'), 'utf8').includes('live_gaps_summary'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/setup.ejs'), 'utf8').includes('enrich_gaps_lead'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('live_gaps_summary'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('enrich_gaps_lead'));
assert.ok(COPY.zh.enrich_gaps_title);
assert.ok(COPY.en.enrich_gaps_title);
for (const lang of Object.keys(COPY)) {
  for (const [key, value] of Object.entries(COPY[lang])) {
    assert.ok(!emoji.test(String(value)), `emoji in ${lang}.${key}`);
  }
}
assert.deepStrictEqual(Object.keys(COPY.zh).sort(), Object.keys(COPY.en).sort());
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
assert.ok(COPY.zh.peers_col_name.includes('公司'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes("t('growth_chart')"));
assert.ok(!fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes("growth_chart') %> ·"));
assert.ok(COPY.en.growth_launch.toLowerCase().includes('launch'));
assert.ok(COPY.zh.growth_launch.includes('开通'));
assert.ok(COPY.en.growth_launched.toLowerCase().includes('launched'));
assert.ok(COPY.zh.growth_launched_end.includes('开通'));
assert.ok(COPY.en.growth_adoption.includes('Dongguan'));
assert.ok(COPY.en.growth_adoption.includes('CNC'));
assert.ok(COPY.zh.growth_adoption.includes('东莞'));
assert.ok(COPY.zh.growth_adoption.includes('PCBA'));
assert.ok(COPY.en.preview_lead.toLowerCase().includes('prefill'));
assert.ok(!COPY.en.preview_lead.toLowerCase().includes('no real'));
assert.ok(COPY.en.flow2_t.includes('ChatGPT'));
assert.ok(!COPY.en.flow2_d.toLowerCase().includes('airsup'));
assert.ok(COPY.zh.flow2_t.includes('ChatGPT'));
assert.ok(!COPY.zh.plugin_lead.includes('客服'));
assert.ok(COPY.en.cta_activate.toLowerCase().includes('prefilled'));
assert.ok(!COPY.en.cta_activate.toLowerCase().includes('endpoint'));
assert.ok(!COPY.en.plugin_lead.toLowerCase().includes('plugin'));
assert.ok(!COPY.en.lead.toLowerCase().includes('airsup connects'));
assert.ok(!COPY.en.nav_why.toLowerCase().includes('join'));
assert.ok(COPY.en.faq4_q.toLowerCase().includes('chatgpt'));
assert.ok(!COPY.en.faq4_q.toLowerCase().includes('onboarding'));
assert.ok(!COPY.en.a2a_title.toLowerCase().includes('airsup'));
assert.ok(!COPY.zh.plugin_lead.includes('插件'));
assert.ok(COPY.en.plugin_video.toLowerCase().includes('chatgpt'));
assert.ok(COPY.zh.plugin_video.includes('ChatGPT'));
assert.ok(COPY.en.footer.toLowerCase().includes('tademehl.com'));
assert.ok(COPY.en.footer_ops.toLowerCase().includes('airsup'));
assert.ok(COPY.en.footer_contact.includes('hello@tademehl.com'));
assert.ok(!COPY.en.footer.includes('tademehl@gmail.com'));
assert.ok(COPY.zh.peers_title.includes('上线'));
assert.ok(!COPY.en.peers_title.toLowerCase().includes('competitor'));
assert.ok(COPY.zh.risk_1.includes('免费'));
assert.ok(COPY.en.risk_4.toLowerCase().includes('password'));
assert.ok(COPY.zh.rfq_title.includes('询盘'));
assert.ok(COPY.en.case_badge.toLowerCase().includes('real'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('hero_trust_1'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('risk_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('ops_wechat_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('rfq_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/footer.ejs'), 'utf8').includes('footer_ops'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/footer.ejs'), 'utf8').includes('hello@tademehl.com'));
assert.strictEqual(COPY.en.preview_lead.includes('prefill'), true);
assert.ok(!COPY.en.preview_lead.toLowerCase().includes('no real'));
assert.ok(COPY.en.note.toLowerCase().includes('wechat'));
assert.ok(COPY.zh.note.includes('微信'));
assert.ok(COPY.zh.err_free_mail.includes('不能自动验证'));
assert.ok(!fs.readFileSync(path.join(__dirname, 'domain.js'), 'utf8').includes('ALLOW_FREE_MAIL'));
assert.ok(fs.readFileSync(path.join(__dirname, 'domain.js'), 'utf8').includes("'163.com'"));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('buyer-plugin.mp4'));
assert.ok(fs.existsSync(path.join(__dirname, 'public/buyer-plugin.mp4')));
assert.ok(fs.existsSync(path.join(__dirname, 'public/buyer-plugin.jpg')));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/setup.ejs'), 'utf8').includes('cn-more-stay'));
assert.ok(!fs.readFileSync(path.join(__dirname, 'views/setup.ejs'), 'utf8').includes('cn-more-stay" open'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/setup.ejs'), 'utf8').includes('setup_primary_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/setup.ejs'), 'utf8').includes('setup_site_summary'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/setup.ejs'), 'utf8').includes("t('wechat_ph')"));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('live_boss_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('operatorSummary'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('live_gaps_summary'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('live_status_value'));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes('showLive'));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("edit === '1'"));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes("partials/demo"));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('proofLine'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/preview.ejs'), 'utf8').includes("partials/demo"));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/header.ejs'), 'utf8').includes('header_live'));
assert.ok(COPY.zh.live_boss_title);
assert.ok(COPY.en.live_boss_title);
assert.ok(COPY.zh.wechat_ph.includes('微信'));
const { gapWhy, operatorListingSummary, formatLiveAt } = require('./fields');
assert.ok(gapWhy({ why_zh: '还没有销售微信', why_en: 'No WeChat' }, 'zh').includes('微信'));
assert.ok(gapWhy({ why_zh: '还没有销售微信', why_en: 'No WeChat' }, 'en').includes('WeChat'));
assert.ok(operatorListingSummary({ company_name: '深圳某某', city: 'shenzhen', profile: { processes: ['5axis'] } }, 'zh').includes('深圳'));
assert.ok(formatLiveAt('2026-09-15T12:00:00.000Z', 'zh').includes('2026'));

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
  isGarbageRfqValue,
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
assert.strictEqual(isGarbageRfqValue('tolerance or finish, target date, destination.'), true);
assert.strictEqual(mergeRfq(
  { tolerance: 'tolerance or finish, target date, destination.', destination: 'Shenzhen' },
  { tolerance: '', destination: 'Shenzhen' }
).tolerance, '');
const dump = extractRfqFromText('Noted from this thread: quantity 20 pieces; material Stainless; tolerance tolerance or finish, target date, destination.; destination Shenzhen; Still needed for a usable RFQ: target date.');
assert.ok(!/tolerance or finish/i.test(dump.tolerance || ''));

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
assert.ok(!fallbackReply({ company: factory, message: 'Can you mill this?', rfq: {} }).includes('Noted from this thread'));
assert.ok(!fallbackReply({
  company: { ...factory, profile: { ...factory.profile, holidays: 'CNY shutdown' } },
  message: 'Can you mill this?',
  rfq: {},
}).includes('CNY shutdown'));
assert.ok(fallbackReply({
  company: { ...factory, profile: { ...factory.profile, holidays: 'CNY shutdown' } },
  message: 'Can you mill this by February?',
  rfq: {},
}).includes('CNY shutdown'));
assert.ok(fallbackReply({ company: factory, message: 'Need a PCBA run', rfq: {} }).toLowerCase().includes('not what we do'));
assert.ok(systemPrompt(factory).includes('sales engineer'));
assert.ok(systemPrompt(factory).includes('5-axis aluminum brackets'));
assert.ok(systemPrompt(factory).includes('Keep every RFQ field'));
assert.ok(systemPrompt(factory).includes('brochure'));
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
assert.ok(!fallbackReply({
  company: factory,
  message: 'Also anodize them.',
  rfq: { quantity: '20 pieces', material: 'Stainless', destination: 'Shenzhen' },
  history: [{ role: 'buyer', body: 'Need 20 pieces' }, { role: 'factory', body: 'Still needed for a usable RFQ: target date.' }],
}).includes('Noted from this thread'));

const notice = factoryNoticeMail({
  lang: 'zh',
  company: factory,
  callerName: 'Ada Buyer',
  message: 'Need a quote',
  reply: 'Please send qty and material.',
  rfq: { quantity: '500 pcs', material: 'aluminum' },
  reason: 'rfq',
});
assert.ok(notice.subject.includes('ChatGPT'));
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
    const notDump = await completeReply({
      company: factory,
      history: [
        { role: 'buyer', body: 'Need 20 pieces stainless' },
        { role: 'factory', body: 'Still needed for a usable RFQ: tolerance or finish, target date, destination.' },
      ],
      message: 'drawings attached',
      rfq: { quantity: '20 pieces', material: 'Stainless', tolerance: 'tolerance or finish, target date, destination.' },
    });
    assert.ok(!notDump.reply.includes('Noted from this thread'));
    assert.ok(!String(notDump.rfq.tolerance || '').includes('tolerance or finish'));
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
