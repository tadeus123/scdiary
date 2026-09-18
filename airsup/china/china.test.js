const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { domainMatches, emailAllowedForSite, normalizeDomain } = require('./domain');
const { proofLines, proofPayload, industryPeers, liveSeries, formatChartDay, chartFromSeries, liveRoster, liveCompanies } = require('./proof');
const { canPublish, normalizeProfile, mapCityId, fillEmptyCompany, listedContacts, buyerTestPrompt } = require('./fields');
const { extractSiteEmails } = require('./site-preview');
const { verifyMail } = require('./mail');
const { isBroadFactoryQuery, scoreCompany } = require('./find');

assert.ok(isBroadFactoryQuery('how many factories'));
assert.ok(isBroadFactoryQuery('CNC shops in Dongguan'));
assert.ok(!isBroadFactoryQuery('Anna Schmidt tango'));
assert.ok(scoreCompany({ company_name: 'Acme', domain: 'acme.com', niche: 'cnc', profile: {} }, 'factories') > 0);

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
assert.ok(Array.isArray(payload.chart.points) && payload.chart.points[0].label_en);
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
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('cn-chart'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('cn-chart-tip'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('growth_launch'));
assert.ok(!fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes("partials/demo"));
assert.ok(!fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('ops_wechat_title'));
assert.ok(!fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('加微信'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('cn-hero-form'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('proof_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('what_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('cn-factory-cards'));
assert.ok(!fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('step_a_t'));
assert.ok(!fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('cn-activate-steps'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('trust_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('faq_openai_q'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('hero_openai_note'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('buyer-plugin.mp4'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('preload="none"'));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes('listCompaniesProof'));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("maxAge: '7d'"));
assert.ok(fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8').includes('listCompaniesProof'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('rfq_title'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('manual_email_cta'));
assert.ok(COPY.en.growth_launch.toLowerCase().includes('launch'));
assert.ok(COPY.zh.growth_launch.includes('开通'));
assert.ok(COPY.en.cta_activate.toLowerCase().includes('prefilled'));
assert.ok(!COPY.en.cta_activate.toLowerCase().includes('endpoint'));
assert.ok(COPY.en.footer.toLowerCase().includes('huge production'));
assert.ok(COPY.en.footer_credit.toLowerCase().includes('tade mehl production'));
assert.ok(COPY.en.footer_ops.toLowerCase().includes('huge production'));
assert.ok(COPY.zh.footer_ops.includes('HUGE Production GmbH'));
assert.ok(COPY.en.footer_contact.includes('tademehl@gmail.com'));
assert.ok(!COPY.en.footer.includes('tademehl@gmail.com'));
assert.ok(COPY.zh.peers_title.includes('上线'));
assert.ok(!COPY.en.peers_title.toLowerCase().includes('competitor'));
assert.ok(COPY.zh.trust_1.includes('官网'));
assert.ok(COPY.en.trust_5.toLowerCase().includes('password'));
assert.ok(COPY.zh.rfq_title.includes('询盘'));
assert.ok(COPY.en.faq_openai_a.toLowerCase().includes('independent'));
assert.ok(COPY.zh.faq_noemail_a.includes('tademehl@gmail.com'));
assert.ok(!COPY.zh.note.includes('加微信'));
assert.ok(COPY.en.note.toLowerCase().includes('tademehl@gmail.com'));
assert.ok(COPY.zh.err_free_mail.includes('不能自动验证'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/footer.ejs'), 'utf8').includes('footer_ops'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/footer.ejs'), 'utf8').includes('tademehl@gmail.com'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/footer.ejs'), 'utf8').includes('/airsup/china/privacy'));
assert.ok(fs.existsSync(path.join(__dirname, 'views/privacy.ejs')));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("'/privacy'"));
assert.ok(!fs.readFileSync(path.join(__dirname, 'domain.js'), 'utf8').includes('ALLOW_FREE_MAIL'));
assert.ok(fs.readFileSync(path.join(__dirname, 'domain.js'), 'utf8').includes("'163.com'"));
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
assert.ok(fs.readFileSync(path.join(__dirname, 'views/home.ejs'), 'utf8').includes('proofLine'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/preview.ejs'), 'utf8').includes("partials/demo"));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/header.ejs'), 'utf8').includes('header_live'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/partials/header.ejs'), 'utf8').includes('#what'));
assert.ok(COPY.zh.live_boss_title);
assert.ok(COPY.en.live_boss_title);
assert.ok(COPY.zh.wechat_ph.includes('微信'));
assert.ok(COPY.zh.privacy_page_title.includes('隐私'));
assert.ok(COPY.en.privacy_lead.toLowerCase().includes('plain-language'));
assert.ok(fs.readFileSync(path.join(__dirname, 'views/privacy.ejs'), 'utf8').includes('cn-privacy'));
assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes('quietChrome: true'));
assert.ok(COPY.en.step_c_d.toLowerCase().includes('test prompt'));
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
  chooseReplyModel,
  isGarbageRfqValue,
  allowedNotify,
  notifyReasonFromMessage,
  OPENAI_REPLY_MS_MINI,
  OPENAI_REPLY_MS_4O,
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
assert.ok(systemPrompt(factory).includes('high-bandwidth'));
assert.ok(systemPrompt(factory).includes('dense AI-to-AI'));
assert.ok(!systemPrompt(factory).includes('short buyer-facing chat bubble'));
assert.strictEqual(chooseReplyModel({ message: 'hi', history: [], rfq: {} }), 'gpt-4o-mini');
assert.strictEqual(chooseReplyModel({
  message: 'x'.repeat(950),
  history: [],
  rfq: {},
}), 'gpt-4o-mini');
assert.strictEqual(chooseReplyModel({
  message: 'ready to quote',
  history: [],
  rfq: { quantity: '100', material: 'AL6061', tolerance: '0.05', finish: 'anodize', target_date: 'May', destination: 'DE', drawings: 'STEP', notes: '' },
}), 'gpt-4o');
assert.strictEqual(chooseReplyModel({
  message: 'almost there',
  history: [],
  rfq: { quantity: '100', material: 'AL6061', tolerance: '0.05', finish: '', target_date: 'May', destination: 'DE', drawings: 'STEP', notes: '' },
}), 'gpt-4o');
assert.strictEqual(OPENAI_REPLY_MS_MINI, 12000);
assert.strictEqual(OPENAI_REPLY_MS_4O, 20000);
assert.strictEqual(allowedNotify(factory.actions, 'visit'), true);
assert.strictEqual(allowedNotify(factory.actions, 'call'), true);
assert.strictEqual(notifyReasonFromMessage('please schedule a factory visit', {}), 'visit');
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
  const publicFirst = formatToolResult(first);
  assert.deepStrictEqual(Object.keys(publicFirst.structuredContent).sort(), ['conversation_id', 'reply', 'status']);
  assert.ok(!Object.prototype.hasOwnProperty.call(publicFirst.structuredContent, '_panel'));
  const widgeted = await formatWidgetResult(null, caller, first, { args: { person_id: factory.company_id } });
  assert.ok(!widgeted.structuredContent._panel);
  assert.ok(widgeted.content[0].text.includes(first.conversation_id));
  assert.ok(!widgeted.content[0].text.includes(first.reply));
  assert.ok(!widgeted.content[0].text.includes('widget'));
  assert.ok(!widgeted.content[0].text.startsWith('{'));
  assert.strictEqual(widgeted._meta['openai/outputTemplate'], undefined);
  assert.strictEqual(widgeted._meta['openai/resultCanProduceWidget'], false);
  assert.ok(!widgeted._meta.ui);
  const replyOnly = await formatWidgetResult(null, caller, {
    conversation_id: first.conversation_id,
    status: 'replied',
    reply: first.reply,
  });
  assert.strictEqual(replyOnly._meta['openai/resultCanProduceWidget'], false);
  assert.ok(!replyOnly._meta.ui);

  const second = await maybeHandle(caller, { conversation_id: first.conversation_id, message: 'Also anodize them.' }, deps);
  assert.strictEqual(second.conversation_id, first.conversation_id);
  assert.ok(second.reply.includes('anodize'));
  assert.strictEqual(notices.length, 1);
  assert.strictEqual((seenHistory || []).length, 2);
  assert.strictEqual(second._panel.messages.length, 4);
  const continued = await formatWidgetResult(null, caller, second, { args: { conversation_id: first.conversation_id } });
  assert.strictEqual(continued._meta['openai/resultCanProduceWidget'], false);
  assert.strictEqual(continued._meta['openai/outputTemplate'], undefined);
  assert.ok(!continued._meta.ui);

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
  assert.strictEqual(pausedWidget._meta['openai/resultCanProduceWidget'], false);
  assert.ok(!pausedWidget._meta.ui);
  assert.ok(pausedWidget.structuredContent.reply === paused.reply);

  const ai = await completeReply({
    company: factory,
    caller,
    history: [{ role: 'buyer', body: 'Can you mill brackets?' }, { role: 'factory', body: 'Yes, 5-axis aluminum.' }],
    message: 'Need 200 pcs to Germany',
    rfq: {},
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.model, 'gpt-4o-mini');
      assert.strictEqual(body.max_tokens, 1400);
      assert.ok(body.messages[0].content.includes('Acme CNC'));
      assert.ok(body.messages[0].content.includes('high-bandwidth'));
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

  const escalated = await completeReply({
    company: factory,
    caller,
    history: [],
    message: 'Need 200 pcs aluminum 6061 ±0.05 anodized to Germany by May, STEP attached, ready for quote.',
    rfq: {
      quantity: '200 pcs',
      material: 'aluminum 6061',
      tolerance: '±0.05',
      finish: 'anodized',
      target_date: 'May',
      destination: 'Germany',
      drawings: 'STEP',
      notes: '',
    },
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.model, 'gpt-4o');
      assert.strictEqual(body.max_tokens, 1400);
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  reply: 'Long packet acknowledged with fit analysis and next steps.',
                  rfq: {
                    quantity: '200 pcs',
                    material: 'aluminum 6061',
                    tolerance: '±0.05',
                    finish: 'anodized',
                    target_date: 'May',
                    destination: 'Germany',
                    drawings: 'STEP',
                  },
                  rfq_complete: true,
                  notify_factory: true,
                  notify_reason: 'rfq',
                }),
              },
            }],
          };
        },
      };
    },
  });
  assert.ok(escalated.reply.includes('fit analysis'));

  const longStayFast = await completeReply({
    company: factory,
    caller,
    history: [],
    message: 'x'.repeat(950),
    rfq: {},
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.model, 'gpt-4o-mini');
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  reply: 'Fast mini reply on a long buyer packet.',
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
  assert.ok(longStayFast.reply.includes('Fast mini'));

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

  const incompleteForced = normalizeOutcome({
    reply: 'Not enough yet.',
    rfq: { quantity: '10', material: 'alu' },
    rfq_complete: false,
    notify_factory: true,
    notify_reason: 'rfq',
  }, { reply: 'fallback', rfq: {}, actions: factory.actions });
  assert.strictEqual(incompleteForced.notify_reason, 'none');
  assert.strictEqual(incompleteForced.notify_factory, false);

  const visitFromMessage = normalizeOutcome({
    reply: 'I will email sales about a visit.',
    rfq: {},
    rfq_complete: false,
    notify_factory: false,
    notify_reason: 'none',
  }, { reply: 'fallback', rfq: {}, actions: factory.actions }, 'visit');
  assert.strictEqual(visitFromMessage.notify_reason, 'visit');
  assert.strictEqual(visitFromMessage.notify_factory, true);

  const visitAi = await completeReply({
    company: factory,
    caller,
    history: [],
    message: 'Can we schedule a factory visit next month?',
    rfq: {},
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      assert.ok(!String(body.messages[body.messages.length - 1].content).includes('Known RFQ so far'));
      assert.strictEqual(body.model, 'gpt-4o-mini');
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  reply: 'Yes, I can email sales about a visit.',
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
  assert.strictEqual(visitAi.notify_reason, 'visit');
  assert.strictEqual(visitAi.notify_factory, true);

  const ownerStore = memoryChina([{ ...factory }]);
  const ownerDeps = {
    db: ownerStore,
    completeReply: async () => ({
      reply: 'ok',
      rfq: {},
      rfq_complete: false,
      notify_factory: false,
      notify_reason: 'none',
    }),
    sendFactoryNotice: async () => {},
  };
  const owned = await maybeHandle(caller, { person_id: factory.company_id, message: 'ping' }, ownerDeps);
  const wrongEnd = await maybeEnd({ person_id: 'intruder' }, owned.conversation_id, ownerDeps);
  assert.strictEqual(wrongEnd.status, 'failed');
  const stillOpen = await conversationPanel(caller, owned.conversation_id, ownerDeps);
  assert.strictEqual(stillOpen.status, 'open');

  const liveThenPause = memoryChina([{ ...factory }]);
  const pauseDeps = {
    db: liveThenPause,
    completeReply: async () => ({
      reply: 'live reply',
      rfq: {},
      rfq_complete: false,
      notify_factory: false,
      notify_reason: 'none',
    }),
    sendFactoryNotice: async () => {},
  };
  const beforePause = await maybeHandle(caller, { person_id: factory.company_id, message: 'first live turn' }, pauseDeps);
  assert.strictEqual(beforePause.status, 'replied');
  const companyRow = await liveThenPause.getById(factory.company_id);
  companyRow.status = 'verified';
  const midPause = await maybeHandle(caller, { conversation_id: beforePause.conversation_id, message: 'still there?' }, pauseDeps);
  assert.ok(midPause.reply.toLowerCase().includes('paused'));
  assert.ok(midPause._panel.messages.length >= 3);
  assert.ok(midPause._panel.messages.some((row) => String(row.body || '').includes('first live')));

  const failMailStore = memoryChina([{ ...factory }]);
  const failNotices = [];
  const failDeps = {
    db: failMailStore,
    completeReply: async () => ({
      reply: 'Ready to quote.',
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
    sendFactoryNotice: async () => {
      failNotices.push(1);
      throw new Error('smtp down');
    },
  };
  const failMail = await maybeHandle(caller, { person_id: factory.company_id, message: 'full rfq please quote' }, failDeps);
  assert.strictEqual(failMail.status, 'replied');
  assert.strictEqual(failNotices.length, 1);
  const failThreadId = failMail.conversation_id.slice(CONV_PREFIX.length);
  const failThread = await failMailStore.getThread(failThreadId);
  assert.deepStrictEqual(failThread.notify_reasons || [], []);
  assert.ok(!failThread.emailed_at);

  const { sendBatch, sendToMany, MAX_BATCH, mapPool, PEOPLE_FAIL_REPLY } = require('./batch');
  const { normalizeSendArgs } = require('./targets');
  const f2 = {
    ...factory,
    company_id: '22222222-2222-2222-2222-222222222222',
    company_name_en: 'Beta CNC',
    domain: 'beta-cnc.com',
  };
  const f3 = {
    ...factory,
    company_id: '33333333-3333-3333-3333-333333333333',
    company_name_en: 'Gamma CNC',
    domain: 'gamma-cnc.com',
  };
  const batchStore = memoryChina([factory, f2, f3]);
  let batchCalls = 0;
  const batchDeps = {
    db: batchStore,
    completeReply: async ({ company }) => {
      batchCalls += 1;
      return {
        reply: `Hello from ${company.company_name_en || company.domain}`,
        rfq: {},
        rfq_complete: false,
        notify_factory: false,
        notify_reason: 'none',
      };
    },
    sendFactoryNotice: async () => {},
  };
  const batch = await sendBatch(caller, {
    person_ids: [factory.company_id, f2.company_id, f3.company_id, factory.company_id],
    message: 'Need 100 aluminum brackets, STEP attached.',
  }, batchDeps);
  assert.strictEqual(batch.results.length, 3);
  assert.strictEqual(batch.completed, 3);
  assert.strictEqual(batch.failed, 0);
  assert.strictEqual(batchCalls, 3);
  assert.ok(batch.results.every((row) => row.status === 'replied' && row.conversation_id.startsWith(CONV_PREFIX)));
  assert.notStrictEqual(batch.results[0].conversation_id, batch.results[1].conversation_id);
  assert.strictEqual(batch.results[0].person_id, factory.company_id);
  assert.strictEqual(batch.results[1].person_id, f2.company_id);
  assert.strictEqual(batch.results[2].person_id, f3.company_id);

  const viaTo = await sendToMany(caller, {
    targets: [factory.company_id, f2.company_id],
    message: 'via to field',
  }, batchDeps);
  assert.strictEqual(viaTo.completed, 2);
  assert.ok(viaTo.results.every((row) => row.to && row.status === 'replied'));

  const cnA = viaTo.results[0].conversation_id;
  const cnB = viaTo.results[1].conversation_id;
  const mixedFollow = await sendToMany(caller, {
    targets: [cnA, cnB, f3.company_id],
    message: 'follow-up on MOQ',
  }, batchDeps);
  assert.strictEqual(mixedFollow.results.length, 3);
  assert.strictEqual(mixedFollow.completed, 3);
  assert.strictEqual(mixedFollow.results[0].conversation_id, cnA);
  assert.strictEqual(mixedFollow.results[1].conversation_id, cnB);
  assert.ok(mixedFollow.results[2].conversation_id.startsWith(CONV_PREFIX));

  const singleNorm = normalizeSendArgs({ to: [factory.company_id], message: 'hi' });
  assert.strictEqual(singleNorm.targets.length, 1);
  assert.strictEqual(singleNorm.targets[0].id, factory.company_id);
  assert.strictEqual(singleNorm.targets[0].mode, 'auto');
  const legacyConvWins = normalizeSendArgs({
    person_id: factory.company_id,
    conversation_id: 'cn_abc',
    message: 'x',
  });
  assert.strictEqual(legacyConvWins.targets[0].id, 'cn_abc');
  assert.strictEqual(legacyConvWins.targets[0].mode, 'conversation');
  const prefixed = normalizeSendArgs({
    to: [`conversation:${cnA}`, `factory:${f3.company_id}`],
    message: 'prefixed follow-up',
  });
  assert.strictEqual(prefixed.targets[0].mode, 'conversation');
  assert.strictEqual(prefixed.targets[0].id, cnA);
  assert.strictEqual(prefixed.targets[1].mode, 'factory');
  const prefixedSend = await sendToMany(caller, {
    targets: prefixed.targets,
    message: 'prefixed follow-up',
  }, batchDeps);
  assert.strictEqual(prefixedSend.completed, 2);
  assert.strictEqual(prefixedSend.results[0].conversation_id, cnA);
  const mixErr = normalizeSendArgs({
    to: [factory.company_id],
    person_id: f2.company_id,
    message: 'x',
  });
  assert.ok(mixErr.error);

  const mixedBatch = await sendBatch(caller, {
    person_ids: [factory.company_id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    message: 'quote please',
  }, batchDeps);
  assert.strictEqual(mixedBatch.results.length, 2);
  assert.strictEqual(mixedBatch.completed, 1);
  assert.strictEqual(mixedBatch.failed, 1);
  assert.strictEqual(mixedBatch.results[1].status, 'failed');
  assert.ok(String(mixedBatch.results[1].reply || '').includes('factory') || mixedBatch.results[1].reply === PEOPLE_FAIL_REPLY);

  const tooMany = await sendBatch(caller, {
    person_ids: Array.from({ length: MAX_BATCH + 1 }, (_, i) => `id-${i}`),
    message: 'x',
  }, batchDeps);
  assert.strictEqual(tooMany.results.length, 0);
  assert.ok(String(tooMany.error || '').includes('1000'));

  const order = [];
  const mapped = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
    await new Promise((r) => setTimeout(r, 5));
    order.push(n);
    return n * 10;
  });
  assert.deepStrictEqual(mapped, [10, 20, 30, 40, 50]);
  assert.deepStrictEqual(order.sort((a, b) => a - b), [1, 2, 3, 4, 5]);

  const { toolList } = require('../mcp');
  assert.ok(toolList().tools[1].inputSchema.properties.to);
  assert.ok(toolList().tools[1].inputSchema.properties.person_ids);
  assert.strictEqual(toolList().tools[1].inputSchema.properties.to.maxItems, 1000);
  assert.ok(toolList().tools[1].description.includes('Prefer `to`') || toolList().tools[1].description.includes('to'));
  const narrated = formatToolResult({
    results: [
      { to: 'a', person_id: 'a', name: 'A', conversation_id: 'cn_1', status: 'replied', reply: 'ok' },
      { to: 'b', person_id: 'b', name: 'B', conversation_id: '', status: 'failed', reply: null },
    ],
    completed: 1,
    failed: 1,
  });
  assert.ok(narrated.content[0].text.includes('batch'));
  assert.ok(narrated.content[0].text.includes('1 replied'));

  const {
    normalizeNiche,
    normalizeQuotationKnowledge,
    quotationInsightsText,
    listingText: listingTextFn,
    endpointRecord: endpointRecordFn,
    NICHES,
    PROCESSES,
  } = require('./fields');
  const { scoreCompany, isBroadFactoryQuery } = require('./find');
  const {
    isAllowedFile,
    redactText,
    heuristicExtract,
    extractPdfText,
  } = require('./quotations');

  assert.ok(NICHES.some((row) => row.id === '3d_printing'));
  assert.ok(PROCESSES.some((row) => row.id === 'sla'));
  assert.ok(PROCESSES.some((row) => row.id === 'mjf'));
  assert.strictEqual(normalizeNiche('3d_printing'), '3d_printing');
  assert.strictEqual(guessNiche('Shenzhen SLA SLS additive 增材 3D printing'), '3d_printing');
  assert.strictEqual(guessNiche('FDM MJF resin prototypes'), '3d_printing');
  const demo3d = personalizedDemo('en', {
    domain: 'china-3dprinting.com',
    companyName: 'Vivian 3D',
    city: 'Shenzhen',
    niche: '3d_printing',
  });
  assert.ok(demo3d.chatgptBuyer.toLowerCase().includes('3d') || demo3d.chatgptBuyer.toLowerCase().includes('sla'));
  assert.ok(isBroadFactoryQuery('3D printing supplier Shenzhen'));
  const live3d = {
    company_id: 'c-3d',
    domain: 'china-3dprinting.com',
    company_name_en: 'Vivian 3D',
    city: 'shenzhen',
    niche: '3d_printing',
    status: 'live',
    profile: { processes: ['sla', 'sls'], materials: ['resin', 'pa12'] },
  };
  assert.ok(scoreCompany(live3d, '3D printing Shenzhen SLA') > 0);
  const hints3d = heuristicHintsFromText('SLA SLS FDM MJF resin PA12 TPU 增材');
  assert.ok(hints3d.processes.includes('sla'));
  assert.ok(hints3d.processes.includes('mjf'));
  assert.ok(hints3d.materials.includes('resin'));
  assert.ok(hints3d.materials.includes('pa12'));

  const quoteCompany = {
    company_id: 'c-quote',
    domain: 'quote-factory.com',
    company_name_en: 'Quote Factory',
    city: 'shenzhen',
    niche: '3d_printing',
    status: 'live',
    context: 'SLA prototypes',
    goal: 'Win RFQs',
    profile: {
      processes: ['sla'],
      materials: ['resin'],
      quotation_knowledge: {
        endpoint_use: false,
        documents: [{
          id: 'doc1',
          name: 'secret-quote.pdf',
          mime: 'application/pdf',
          storage_path: 'c-quote/doc1/secret-quote.pdf',
          uploaded_at: '2026-09-18T00:00:00.000Z',
          status: 'ready',
        }],
        extracted: {
          summary: 'Often quotes 20–50 SLA resin pcs',
          insights_for_endpoint: 'Typical lot 20-50 pcs SLA resin; ask for STEP before lead time',
          typical_quantities: ['20 pcs', '50 pcs'],
          buyer_questions: ['Need drawing before quote?'],
        },
      },
    },
  };
  const endpointOff = endpointRecordFn(quoteCompany);
  assert.ok(!JSON.stringify(endpointOff).includes('quotation_knowledge'));
  assert.ok(!JSON.stringify(endpointOff).includes('secret-quote'));
  assert.ok(!JSON.stringify(endpointOff).includes('storage_path'));
  assert.ok(!listingTextFn(quoteCompany).includes('Quotation-learned'));
  assert.strictEqual(quotationInsightsText(quoteCompany), '');

  const quoteOn = {
    ...quoteCompany,
    profile: {
      ...quoteCompany.profile,
      quotation_knowledge: {
        ...quoteCompany.profile.quotation_knowledge,
        endpoint_use: true,
      },
    },
  };
  const listingOn = listingTextFn(quoteOn);
  assert.ok(listingOn.includes('Quotation-learned'));
  assert.ok(listingOn.includes('Typical lot 20-50'));
  assert.ok(!listingOn.includes('secret-quote'));
  assert.ok(!JSON.stringify(endpointRecordFn(quoteOn)).includes('quotation_knowledge'));

  assert.ok(isAllowedFile({
    originalname: 'a.pdf',
    mimetype: 'application/pdf',
    size: 100,
    buffer: Buffer.from('%PDF-1.4 (Hello SLA resin) Tj'),
  }));
  assert.ok(!isAllowedFile({
    originalname: 'a.exe',
    mimetype: 'application/octet-stream',
    size: 100,
    buffer: Buffer.alloc(100),
  }));
  assert.ok(redactText('Email buyer@acme.com please').includes('[email]'));
  assert.ok(!redactText('Email buyer@acme.com please').includes('buyer@acme.com'));
  const heur = heuristicExtract('SLA resin 20 pcs lead time 5 days FDM PA12');
  assert.ok(heur.processes.includes('sla') || heur.processes.includes('fdm'));
  assert.ok(heur.typical_quantities.some((row) => /20/.test(row)));
  assert.ok(extractPdfText(Buffer.from('%PDF-1.4 (SLA resin quote) Tj')).toLowerCase().includes('sla'));
  assert.strictEqual(normalizeQuotationKnowledge({ endpoint_use: 1, documents: [] }).endpoint_use, true);
  assert.ok(fs.existsSync(path.join(__dirname, 'quotations.js')));
  assert.ok(fs.readFileSync(path.join(__dirname, 'views/setup.ejs'), 'utf8').includes('partials/quotations'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'views/live.ejs'), 'utf8').includes('/airsup/china/quotes'));
  const quotationsPartial = fs.readFileSync(path.join(__dirname, 'views/partials/quotations.ejs'), 'utf8');
  assert.ok(quotationsPartial.includes("empty: <%- JSON.stringify(t('quote_empty')) %>"));
  assert.ok(!quotationsPartial.includes("empty: <%= JSON.stringify(t('quote_empty')) %>"));
  assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes('/api/quotations'));
  assert.ok(COPY.zh.quote_title.includes('报价'));
  assert.ok(COPY.en.quote_title.toLowerCase().includes('quotation'));

  const {
    isDemoCompany,
    listingText: listingForDemo,
  } = require('./fields');
  const { demoSpec, DEMO_DOMAIN, DEMO_NAME_EN, DEMO_EMAIL, onboardingResetPatch, isDemoDomain, syntheticDemoPreview } = require('./demo-company');
  const { matchView } = require('./find');
  const { systemPrompt } = require('./reply');
  const { buildPreview } = require('./site-preview');
  const demoRow = {
    ...demoSpec(),
    company_id: 'demo-id',
    live_at: '2026-09-18T00:00:00.000Z',
  };
  assert.ok(isDemoCompany(demoRow));
  assert.ok(isDemoCompany({ source: 'demo', domain: DEMO_DOMAIN }));
  assert.ok(!isDemoCompany({ source: 'web', domain: 'acme.com', profile: {} }));
  assert.ok(isDemoDomain(DEMO_DOMAIN));
  assert.ok(isDemoDomain(`https://www.${DEMO_DOMAIN}/about`));
  assert.ok(!isDemoDomain('acme.com'));
  assert.ok(DEMO_DOMAIN.includes('demo'));
  assert.ok(DEMO_EMAIL.endsWith(`@${DEMO_DOMAIN}`));
  const resetPatch = onboardingResetPatch();
  assert.strictEqual(resetPatch.status, 'pending');
  assert.strictEqual(resetPatch.live_at, null);
  assert.strictEqual(resetPatch.verified_at, null);
  assert.ok(resetPatch.profile.is_demo);
  assert.strictEqual(resetPatch.company_name_en, '');
  const synth = syntheticDemoPreview('en');
  assert.ok(synth.ok);
  assert.strictEqual(synth.domain, DEMO_DOMAIN);
  assert.ok(synth.siteEmails.includes(DEMO_EMAIL));
  assert.strictEqual(synth.niche, '3d_printing');
  const builtDemo = await buildPreview(DEMO_DOMAIN, 'en');
  assert.ok(builtDemo.ok);
  assert.strictEqual(builtDemo.domain, DEMO_DOMAIN);
  const hidden = liveCompanies([
    {
      status: 'live',
      live_at: '2026-09-18T00:00:00.000Z',
      domain: 'real-factory.com',
      company_name_en: 'Real Factory',
      niche: 'cnc',
      source: 'web',
    },
    demoRow,
  ]);
  assert.strictEqual(hidden.length, 1);
  assert.strictEqual(hidden[0].domain, 'real-factory.com');
  const roster = liveRoster([demoRow, {
    status: 'live',
    live_at: '2026-09-18T00:00:00.000Z',
    domain: 'peer.com',
    company_name_en: 'Peer',
    niche: '3d_printing',
  }]);
  assert.ok(!roster.factories.some((row) => row.domain === DEMO_DOMAIN));
  const demoListing = listingForDemo(demoRow);
  assert.ok(demoListing.includes('DEMO COMPANY'));
  assert.ok(demoListing.includes('Tade'));
  const found = matchView(demoRow, 'demo 3D printing Shenzhen');
  assert.ok(found.name.includes('Demo') || found.name.includes('Tade'));
  assert.ok(found.description.includes('DEMO'));
  assert.ok(found.demo);
  assert.ok(scoreCompany(demoRow, 'Airsup demo company') > scoreCompany(demoRow, 'zzz'));
  const prompt = systemPrompt(demoRow);
  assert.ok(prompt.includes('DEMO'));
  assert.ok(prompt.includes('NOT a real factory'));
  assert.ok(fs.existsSync(path.join(__dirname, 'demo-company.js')));
  assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("router.get('/demo'"));
  assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("router.get('/demo/onboarding'"));
  assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("router.get('/quotes'"));
  assert.ok(fs.existsSync(path.join(__dirname, 'views/quotes.ejs')));
  assert.ok(fs.readFileSync(path.join(__dirname, 'views/check.ejs'), 'utf8').includes('demo_check_cta'));
  assert.ok(COPY.zh.demo_banner.includes('演示'));
  assert.ok(COPY.en.demo_banner.toLowerCase().includes('demo'));
  assert.ok(COPY.en.demo_restart_onboarding.toLowerCase().includes('onboarding'));
  assert.ok(COPY.zh.quote_page_title.includes('上传'));
  assert.ok(COPY.en.quote_page_title.toLowerCase().includes('upload'));
  assert.ok(COPY.zh.mail_quotes_button.includes('上传'));
  assert.ok(COPY.en.mail_quotes_button.toLowerCase().includes('upload'));
  const { quotesInviteMail } = require('./mail');
  const qMail = quotesInviteMail({
    lang: 'en',
    link: 'https://www.tademehl.com/airsup/china/verify?token=abc&next=quotes',
    contactName: 'Lynn',
    companyName: 'Elite',
  });
  assert.ok(qMail.subject.toLowerCase().includes('quotation') || qMail.subject.includes('报价'));
  assert.ok(qMail.text.includes('https://www.tademehl.com/airsup/china/verify?token=abc&next=quotes'));
  assert.strictEqual(DEMO_NAME_EN.includes('Demo'), true);

  // Isolated company-web concept at /airsup/china/test
  assert.ok(fs.existsSync(path.join(__dirname, 'test/routes.js')));
  assert.ok(fs.existsSync(path.join(__dirname, 'test/views/chat.ejs')));
  assert.ok(fs.existsSync(path.join(__dirname, 'test/web.js')));
  assert.ok(fs.existsSync(path.join(__dirname, 'test/REPLACE.md')));
  assert.ok(fs.existsSync(path.join(__dirname, 'test/memory-store.js')));
  assert.ok(fs.existsSync(path.join(__dirname, 'test/onboard.js')));
  assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes("router.use('/test'"));
  assert.ok(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8').includes('AIRSUP-CHINA-TEST-BEGIN'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'test/views/chat.ejs'), 'utf8').includes('cn-test-network'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'test/views/chat.ejs'), 'utf8').includes('cn-test-dock'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'test/views/chat.ejs'), 'utf8').includes('cn-test-onboard'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'test/views/chat.ejs'), 'utf8').includes('vis-network@10.1.2'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'test/views/chat.ejs'), 'utf8').includes('login/request'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'test/views/chat.ejs'), 'utf8').includes('api/onboard'));
  assert.ok(fs.existsSync(path.join(__dirname, 'test/public/test-network.js')));
  assert.ok(fs.readFileSync(path.join(__dirname, 'test/public/test-network.js'), 'utf8').includes('gravitationalConstant: -5000'));
  assert.ok(!fs.readFileSync(path.join(__dirname, 'test/views/chat.ejs'), 'utf8').includes('cn-test-thread'));
  assert.ok(!fs.readFileSync(path.join(__dirname, 'test/views/chat.ejs'), 'utf8').includes('cn-test-universe'));
  const testRoutesSrc = fs.readFileSync(path.join(__dirname, 'test/routes.js'), 'utf8');
  assert.ok(testRoutesSrc.includes("/api/onboard/preview"));
  assert.ok(testRoutesSrc.includes("/api/onboard/start"));
  assert.ok(testRoutesSrc.includes("/api/onboard/fields"));
  assert.ok(testRoutesSrc.includes("/api/onboard/publish"));
  assert.ok(testRoutesSrc.includes("/api/onboard/state"));
  assert.ok(testRoutesSrc.includes("/api/onboard/demo"));
  assert.ok(testRoutesSrc.includes("router.get('/verify'"));
  const testOnboard = require('./test/onboard');
  assert.strictEqual(typeof testOnboard.previewWebsite, 'function');
  assert.strictEqual(typeof testOnboard.startSignup, 'function');
  assert.strictEqual(typeof testOnboard.consumeVerifyToken, 'function');
  assert.strictEqual(typeof testOnboard.saveInteraction, 'function');
  assert.strictEqual(typeof testOnboard.publishCompany, 'function');
  assert.strictEqual(typeof testOnboard.qualityReady, 'function');
  assert.strictEqual(typeof testOnboard.seedWebFromPreview, 'function');
  assert.strictEqual(typeof testOnboard.onboardingState, 'function');
  assert.strictEqual(typeof testOnboard.seedWebFromCompany, 'function');
  assert.strictEqual(typeof testOnboard.readTestCompany, 'function');
  assert.strictEqual(typeof testOnboard.openSession, 'function');
  assert.strictEqual(typeof testOnboard.clearTestSession, 'function');
  assert.strictEqual(typeof testOnboard.usingMemory, 'function');
  assert.ok(testOnboard.DEMO_DOMAIN);
  assert.ok(testOnboard.DEMO_EMAIL);
  const memoryStore = require('./test/memory-store');
  memoryStore.resetAll();
  assert.ok(testOnboard.usingMemory());
  const preview = await testOnboard.previewWebsite('https://demo.com', 'en');
  assert.ok(preview.ok);
  assert.strictEqual(preview.domain, 'demo.com');
  const started = await testOnboard.startSignup({
    website: 'https://demo.com',
    email: testOnboard.DEMO_EMAIL,
    contact: 'Tade',
    city: 'shenzhen',
    lang: 'en',
    source: 'test',
    publicOrigin: 'http://localhost:3000',
  });
  assert.ok(started.ok, started.errorKey);
  assert.ok(started.token);
  assert.ok(String(started.verifyPath || '').includes('/airsup/china/test/verify'));
  assert.strictEqual(started.company.status, 'pending');
  const verified = await testOnboard.consumeVerifyToken(started.token);
  assert.ok(verified.ok, verified.errorKey);
  assert.strictEqual(verified.company.status, 'verified');
  assert.strictEqual(testOnboard.qualityReady(verified.company), false);
  const blocked = await testOnboard.publishCompany(verified.company);
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.errorKey, 'err_publish_quality');
  const saved = await testOnboard.saveInteraction(verified.company, {
    contact_wechat: 'airsup_demo_tade',
    sample_lead: 'samples in 3 days',
    flexibility: 'normal',
    contact_name: 'Tade',
    goal: 'Win qualified export RFQs from buyers who find us in ChatGPT.',
  }, 'en');
  assert.ok(saved && saved.company_id);
  assert.ok(testOnboard.qualityReady(saved));
  const published = await testOnboard.publishCompany(saved);
  assert.ok(published.ok, published.errorKey);
  assert.strictEqual(published.company.status, 'live');
  assert.strictEqual(testOnboard.onboardingState(published.company, 'en').step, 'live');
  assert.ok(testOnboard.onboardingState(published.company, 'en').wechat);
  // Demo reset must clear profile (not leave stale WeChat / capabilities).
  memoryStore.resetAll();
  const stale = await memoryStore.insertCompany({
    domain: testOnboard.DEMO_DOMAIN,
    website: `https://${testOnboard.DEMO_DOMAIN}`,
    contact_email: testOnboard.DEMO_EMAIL,
    company_name: 'Stale',
    city: 'shenzhen',
    status: 'live',
    source: 'demo',
    goal: 'old',
    context: 'old',
    profile: {
      processes: ['sla'],
      sample_lead: 'keep?',
      contacts: [{ role: 'ceo', name: 'X', wechat: 'stale_wx' }],
    },
  });
  const cleared = await memoryStore.updateCompany(stale.company_id, onboardingResetPatch());
  assert.strictEqual(cleared.status, 'pending');
  assert.strictEqual(String(cleared.company_name || ''), '');
  assert.ok(!require('./fields').listedContacts(cleared.profile.contacts).length);
  assert.strictEqual(String((cleared.profile && cleared.profile.sample_lead) || ''), '');
  const testChat = require('./test/chat');
  const testWeb = require('./test/web');
  assert.strictEqual(testChat.welcomeMessage('zh'), '');
  assert.strictEqual(Object.keys(testWeb.emptyWeb().nodes).length, 0);
  assert.strictEqual(testWeb.emptyWeb().reach, 0);
  const compressed = testChat.compressHistory(
    Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'x'.repeat(200)}` })),
    'en'
  );
  assert.ok(compressed.summary);
  assert.ok(compressed.history.length <= testChat.KEEP_RECENT);
  const grown = await testChat.completeTestTurn({
    lang: 'en',
    message: 'https://demo.com SLA resin printing',
    history: [],
    files: [{ name: 'quote.pdf', mime: 'application/pdf', size: 1200 }],
    company: null,
    web: testWeb.emptyWeb(),
  });
  assert.ok(String(grown.reply || '').length > 2);
  assert.ok(grown.web.reach > 0);
  assert.ok(Object.keys(grown.web.nodes).length >= 2);
  assert.ok((grown.web.edges || []).length >= 1);
  assert.ok(grown.web.reachHistory.length >= 2);
  const ids = Object.keys(grown.web.nodes);
  assert.ok(ids.length >= 2);
  // Prefer an unlinked pair if auto-link already connected the first two
  let linked = testWeb.addCustomLink(grown.web, ids[0], ids[1]);
  if (!linked.ok && linked.reason === 'exists' && ids.length >= 3) {
    linked = testWeb.addCustomLink(grown.web, ids[0], ids[2]);
  }
  assert.ok(linked.ok || linked.reason === 'exists');
  if (linked.ok) {
    assert.ok(linked.web.edges.some((e) => e.kind === 'custom'));
    assert.ok(linked.web.reach >= grown.web.reach);
  }
  const seeded = testWeb.seedFromCompany(testWeb.emptyWeb(), { domain: 'demo.com', company_name: 'Demo Co' }, 'en');
  assert.ok(Object.keys(seeded.web.nodes).length >= 1);

  console.log('airsup china tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
