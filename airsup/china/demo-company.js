const db = require('./db');
const { DEFAULT_ACTIONS, normalizeProfile } = require('./fields');

const DEMO_DOMAIN = 'demo.airsup.tademehl.com';
const DEMO_EMAIL = 'hello@demo.airsup.tademehl.com';
const DEMO_OPS_EMAIL = 'tademehl@gmail.com';
const DEMO_NAME_EN = 'Demo company (Tade / Airsup)';
const DEMO_NAME_ZH = '演示工厂（Tade / Airsup）';

function demoSpec() {
  const now = new Date().toISOString();
  return {
    domain: DEMO_DOMAIN,
    website: `https://${DEMO_DOMAIN}`,
    company_name: DEMO_NAME_ZH,
    company_name_en: DEMO_NAME_EN,
    city: 'shenzhen',
    contact_name: 'Tade Mehl',
    contact_email: DEMO_EMAIL,
    locale: 'en',
    niche: '3d_printing',
    status: 'live',
    source: 'demo',
    context: [
      'INTERNAL AIRSUP DEMO — not a real factory.',
      'Operated by Tade Mehl / HUGE Production to mirror the live supplier dashboard and ChatGPT endpoint.',
      'Capability set is fictional but realistic for Shenzhen SLA/SLS/FDM/MJF work so product bugs surface the same way as for real companies.',
    ].join(' '),
    goal: 'Exercise Airsup end-to-end: discovery, high-bandwidth replies, RFQ collection, quotation intelligence toggle, and the factory live/setup UI.',
    actions: DEFAULT_ACTIONS.slice(),
    verified_at: now,
    live_at: now,
    profile: normalizeProfile({
      is_demo: true,
      year_founded: '2024',
      employees: '12',
      address: 'Demo only — Sebnitzer Straße 35, 01099 Dresden (ops), not a Shenzhen plant',
      export_markets: 'US, EU (demo traffic only)',
      processes: ['sla', 'sls', 'fdm', 'mjf'],
      materials: ['resin', 'pa12', 'tpu', 'alu'],
      finishing: ['polish', 'bead'],
      certifications: ['iso9001'],
      machines: 'Demo fleet: Formlabs SLA, EOS SLS, Bambu FDM, HP MJF 4200 (fictional inventory for testing)',
      tolerance: '±0.1 mm typical on SLA cosmetic parts (demo)',
      max_workpiece: '300 x 300 x 300 mm (demo)',
      moq: '1 pc prototypes; 20+ for small series (demo)',
      lead_time: '3–7 working days typical (demo)',
      shipping: 'DHL / FedEx sample ship (demo)',
      sample_lead: 'samples in 3 working days (demo stand-behind)',
      holidays: 'Demo follows China public holidays for reply realism',
      flexibility: 'normal',
      contacts: [
        { role: 'ceo', name: 'Tade (demo)', wechat: 'airsup_demo_tade' },
        { role: 'sales', name: 'Demo sales', wechat: 'airsup_demo_sales' },
      ],
      site_notes: 'Synthetic demo company for Airsup China. Always refreshed by ensureDemoCompany().',
      claim_ready: false,
      quotation_knowledge: {
        endpoint_use: true,
        updated_at: now,
        documents: [],
        extracted: {
          processes: ['sla', 'sls', 'fdm', 'mjf'],
          materials: ['resin', 'pa12', 'tpu'],
          typical_quantities: ['1–5 pcs prototypes', '20–50 pcs small series'],
          lead_time_phrases: ['3 working days samples', '7 working days small series'],
          tolerances: ['±0.1 mm SLA', '±0.2 mm SLS'],
          buyer_questions: [
            'Do you need STEP before a ballpark?',
            'Can you polish SLA for cosmetic review?',
            'What is MOQ for MJF PA12?',
          ],
          dfm_notes: [
            'Prefer wall thickness ≥1.0 mm for SLA cosmetic housings',
            'SLS PA12 good for functional snap fits in demo quotes',
          ],
          moq: '1 pc prototypes',
          lead_time: '3–7 working days',
          summary: 'Demo quotation patterns for Shenzhen additive: SLA cosmetics, SLS/MJF functional nylon, FDM fixtures.',
          insights_for_endpoint: 'Demo-approved patterns: ask for STEP early; SLA polish common for buyer reviews; typical first lots 1–50 pcs; never invent real customer names or prices.',
        },
      },
    }),
  };
}

function onboardingResetPatch() {
  return {
    website: `https://${DEMO_DOMAIN}`,
    company_name: '',
    company_name_en: '',
    city: 'shenzhen',
    contact_name: '',
    contact_email: DEMO_EMAIL,
    locale: 'zh',
    niche: '3d_printing',
    status: 'pending',
    source: 'demo',
    context: '',
    goal: '',
    actions: DEFAULT_ACTIONS.slice(),
    verified_at: null,
    live_at: null,
    last_email_at: null,
    profile: normalizeProfile({
      is_demo: true,
      year_founded: '',
      employees: '',
      address: '',
      export_markets: '',
      processes: [],
      materials: [],
      finishing: [],
      certifications: [],
      machines: '',
      tolerance: '',
      max_workpiece: '',
      moq: '',
      lead_time: '',
      shipping: '',
      sample_lead: '',
      holidays: '',
      flexibility: 'normal',
      contacts: [
        { role: 'ceo', name: '', wechat: '' },
        { role: 'sales', name: '', wechat: '' },
      ],
      site_notes: '',
      claim_ready: false,
      quotation_knowledge: {
        endpoint_use: false,
        documents: [],
        extracted: {},
        updated_at: '',
      },
    }),
  };
}

function isDemoDomain(value) {
  const host = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
  return host === DEMO_DOMAIN;
}

function syntheticDemoPreview(lang) {
  const zh = lang !== 'en';
  const preview = {
    domain: DEMO_DOMAIN,
    website: `https://${DEMO_DOMAIN}`,
    companyName: zh ? DEMO_NAME_ZH : DEMO_NAME_EN,
    companyNameEn: DEMO_NAME_EN,
    companyNameZh: DEMO_NAME_ZH,
    city: zh ? '深圳' : 'Shenzhen',
    cityId: 'shenzhen',
    capabilities: zh
      ? ['SLA 光固化', 'SLS 尼龙', 'FDM', 'HP MJF']
      : ['SLA resin', 'SLS nylon', 'FDM', 'HP MJF'],
    summary: zh
      ? '演示用深圳增材制造厂（非真实厂家）。用于走通 Airsup 上线流程。'
      : 'Synthetic Shenzhen additive manufacturer for Airsup onboarding tests. Not a real factory.',
    niche: '3d_printing',
    profile: normalizeProfile({
      is_demo: true,
      processes: ['sla', 'sls', 'fdm', 'mjf'],
      materials: ['resin', 'pa12', 'tpu'],
      finishing: ['polish'],
      certifications: ['iso9001'],
      site_notes: 'Synthetic public site text for demo.airsup.tademehl.com onboarding preview.',
    }),
    siteNotes: 'Synthetic public site text for demo.airsup.tademehl.com onboarding preview.',
    siteEmails: [DEMO_EMAIL],
    fromSite: true,
    crawlPages: 1,
  };
  const { personalizedDemo, genericDemo } = require('./demo');
  const { companyDraftFromPreview } = require('./site-preview');
  return {
    ok: true,
    ...preview,
    draft: companyDraftFromPreview(preview),
    demo: personalizedDemo(lang, preview),
    generic: genericDemo(lang),
  };
}

async function ensureDemoAllowlist() {
  if (!db.isConfigured()) return;
  await db.upsertDomainAllow({
    domain: DEMO_DOMAIN,
    contact_email: DEMO_EMAIL,
    source: 'manual',
    note: 'Airsup demo onboarding mailbox (same domain)',
  }).catch(() => null);
  await db.upsertDomainAllow({
    domain: DEMO_DOMAIN,
    contact_email: DEMO_OPS_EMAIL,
    source: 'manual',
    note: 'Airsup demo ops Gmail allow for onboarding tests',
  }).catch(() => null);
}

async function ensureDemoCompany(options = {}) {
  if (!db.isConfigured()) {
    throw new Error('Airsup China storage is not configured.');
  }
  const forceLive = options.forceLive === true;
  const spec = demoSpec();
  const existing = await db.getByDomain(DEMO_DOMAIN);

  if (existing && !forceLive && (existing.status === 'pending' || existing.status === 'verified')) {
    return existing;
  }

  const patch = {
    website: spec.website,
    company_name: spec.company_name,
    company_name_en: spec.company_name_en,
    city: spec.city,
    contact_name: spec.contact_name,
    contact_email: spec.contact_email,
    locale: spec.locale,
    niche: spec.niche,
    status: 'live',
    source: 'demo',
    context: spec.context,
    goal: spec.goal,
    actions: spec.actions,
    profile: spec.profile,
    verified_at: (existing && existing.verified_at) || spec.verified_at,
    live_at: (existing && existing.live_at) || spec.live_at,
  };

  if (!existing) {
    return db.insertCompany({
      domain: DEMO_DOMAIN,
      ...patch,
    });
  }
  return db.updateCompany(existing.company_id, patch);
}

async function resetDemoForOnboarding() {
  if (!db.isConfigured()) {
    throw new Error('Airsup China storage is not configured.');
  }
  await ensureDemoAllowlist();
  const existing = await db.getByDomain(DEMO_DOMAIN);
  const patch = onboardingResetPatch();
  if (!existing) {
    return db.insertCompany({
      domain: DEMO_DOMAIN,
      ...patch,
    });
  }
  if (typeof db.deleteSessionsForCompany === 'function') {
    await db.deleteSessionsForCompany(existing.company_id).catch(() => null);
  }
  return db.updateCompany(existing.company_id, patch);
}

module.exports = {
  DEMO_DOMAIN,
  DEMO_EMAIL,
  DEMO_OPS_EMAIL,
  DEMO_NAME_EN,
  DEMO_NAME_ZH,
  demoSpec,
  onboardingResetPatch,
  isDemoDomain,
  syntheticDemoPreview,
  ensureDemoAllowlist,
  ensureDemoCompany,
  resetDemoForOnboarding,
};
