/**
 * REPLACEABLE simplified China onboarding core for `/airsup/china/test` only.
 *
 * Swap-ready: when the test UI replaces live china onboarding, point routes at
 * these helpers and keep requiring live `../db` + `../session` (and the other
 * modules below). Do NOT duplicate scrape/allowlist/token/mail logic here —
 * always require the live modules.
 *
 * Live UI still lives in `airsup/china/routes.js`. This file mirrors
 * applySiteDraft / POST /start / GET /verify / setup interaction fields, but
 * returns data (no redirects) and uses `/airsup/china/test/verify` links.
 */
const db = require('../db');
const session = require('../session');
const memoryStore = require('./memory-store');
const { buildPreview, companyDraftFromPreview } = require('../site-preview');
const {
  CITIES,
  fillEmptyCompany,
  canPublish,
  normalizeProfile,
  companyTitle,
  enrichmentGaps,
  isDemoCompany,
  listedContacts,
} = require('../fields');
const { normalizeDomain, emailAllowedForSite, emailParts } = require('../domain');
const { sendVerifyEmail } = require('../mail');
const {
  isDemoDomain,
  ensureDemoCompany,
  ensureDemoAllowlist,
  DEMO_DOMAIN,
  DEMO_EMAIL,
} = require('../demo-company');
const { emptyWeb, seedFromCompany, applyDump } = require('./web');

const VERIFY_PATH = '/airsup/china/test/verify';

/** Live Supabase when configured; otherwise test-only memory store (demos / local). */
function store() {
  return db.isConfigured() ? db : memoryStore;
}

function usingMemory() {
  return !db.isConfigured();
}

async function mintToken(companyId, email, purpose) {
  if (!usingMemory()) {
    return session.createToken(companyId, email, purpose);
  }
  const token = session.randomToken();
  await memoryStore.insertToken({
    token_hash: session.sha256(token),
    company_id: companyId,
    email,
    purpose: purpose || 'verify',
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
  return token;
}

async function openSession(req, res, companyId) {
  if (!usingMemory()) {
    return session.createSession(req, res, companyId);
  }
  const sid = session.randomToken();
  await memoryStore.insertSession({
    session_hash: session.sha256(sid),
    company_id: companyId,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  res.cookie('airsup_china_sid', sid, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/airsup/china',
    secure: req.secure || req.get('x-forwarded-proto') === 'https',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

async function readTestCompany(req) {
  if (!usingMemory()) {
    return session.readCompany(req).catch(() => null);
  }
  const sid = session.readSid(req);
  if (!sid) return null;
  const row = await memoryStore.getSession(session.sha256(sid));
  if (!row) return null;
  return memoryStore.getById(row.company_id);
}

async function clearTestSession(req, res) {
  if (!usingMemory()) {
    return session.clearSession(req, res);
  }
  const sid = session.readSid(req);
  if (sid) await memoryStore.deleteSession(session.sha256(sid)).catch(() => null);
  res.clearCookie('airsup_china_sid', { path: '/airsup/china' });
}

function tooSoon(company) {
  if (!company || !company.last_email_at) return false;
  return Date.now() - new Date(company.last_email_at).getTime() < 2 * 60 * 1000;
}

function fail(errorKey) {
  return {
    ok: false,
    errorKey: errorKey || 'err_db',
    company: null,
    token: null,
    verifyPath: null,
    demo: false,
  };
}

/**
 * Same behavior as live routes.js applySiteDraft:
 * skip if live; buildPreview; fillEmptyCompany; default goal; store().updateCompany.
 */
async function applySiteDraft(company, website, lang) {
  if (!company || company.status === 'live') return company;
  try {
    const built = await buildPreview(website || company.website || company.domain, lang);
    if (!built.ok) return company;
    const draft = built.draft || companyDraftFromPreview(built);
    const next = fillEmptyCompany(company, draft);
    if (!String(next.goal || '').trim()) {
      next.goal = lang === 'en'
        ? 'Win qualified export RFQs from buyers who find us in ChatGPT.'
        : '让欧美采购通过 ChatGPT 找到我们并收到可报价的询盘。';
    }
    return store().updateCompany(company.company_id, {
      company_name: next.company_name,
      company_name_en: next.company_name_en,
      city: next.city,
      niche: next.niche,
      context: next.context,
      goal: next.goal,
      profile: next.profile,
    });
  } catch (error) {
    console.error('Airsup china test applySiteDraft skipped:', error.message);
    return company;
  }
}

/** Thin wrap — returns buildPreview result for the test UI. */
async function previewWebsite(website, lang) {
  return buildPreview(website, lang);
}

/**
 * Same rules as live POST /start (emailAllowedForSite, allowlist fallback,
 * 2min rate via last_email_at, insert/update, applySiteDraft, verify/login
 * token, sendVerifyEmail; demo skips mail failure).
 *
 * Returns { ok, errorKey, company, token, verifyPath, demo }.
 * verifyPath is always under /airsup/china/test (never live /verify).
 */
async function startSignup({
  website,
  email,
  contact,
  city,
  lang,
  source,
  publicOrigin,
} = {}) {
  const locale = lang === 'en' ? 'en' : 'zh';
  const contactName = String(contact || '').trim();
  const cityId = String(city || 'shenzhen');
  const src = String(source || 'web').slice(0, 40);
  const origin = String(publicOrigin || '').replace(/\/$/, '');

  let siteEmails = [];
  try {
    const built = await buildPreview(website, locale);
    if (built.ok && Array.isArray(built.siteEmails)) siteEmails = built.siteEmails;
  } catch (error) {
    console.error('Airsup china test site email scrape skipped:', error.message);
  }

  let matched = emailAllowedForSite({ website, email, siteEmails });
  if (!matched.ok && matched.error === 'mismatch') {
    try {
      const site = normalizeDomain(website);
      const parts = emailParts(email);
      const allow = parts ? await store().getDomainAllow(site, parts.email) : null;
      if (allow && parts) {
        matched = {
          ok: true,
          domain: site,
          website: `https://${site}`,
          email: parts.email,
          reason: allow.source || 'outreach',
        };
      }
    } catch (error) {
      console.error('Airsup china test allowlist check skipped:', error.message);
    }
  }
  if (!matched.ok) return fail(`err_${matched.error}`);
  try {
    // Only persist outreach/manual allow rows. Site-contact is re-checked via scrape each time.
    if (matched.reason === 'outreach' || matched.reason === 'manual') {
      await store().upsertDomainAllow({
        domain: matched.domain,
        contact_email: matched.email,
        source: matched.reason,
        note: '',
      }).catch((error) => console.error('Airsup china test allow upsert skipped:', error.message));
    }

    let company = await store().getByDomain(matched.domain);
    if (company && tooSoon(company) && !isDemoCompany(company) && !isDemoDomain(matched.domain)) {
      return fail('err_rate');
    }

    if (!company) {
      company = await store().insertCompany({
        domain: matched.domain,
        website: matched.website,
        contact_email: matched.email,
        contact_name: contactName,
        city: CITIES.some((item) => item.id === cityId) ? cityId : 'shenzhen',
        locale,
        niche: isDemoDomain(matched.domain) ? '3d_printing' : 'cnc',
        status: 'pending',
        source: isDemoDomain(matched.domain) ? 'demo' : src,
      });
    } else if (company.status === 'pending') {
      const existingEmail = String(company.contact_email || '').toLowerCase();
      if (existingEmail && existingEmail !== matched.email) {
        return fail('err_taken');
      }
      company = await store().updateCompany(company.company_id, {
        website: matched.website,
        contact_email: matched.email,
        contact_name: contactName || company.contact_name,
        city: CITIES.some((item) => item.id === cityId) ? cityId : company.city,
        locale,
        source: isDemoCompany(company) ? 'demo' : company.source,
      });
    } else if (matched.email !== String(company.contact_email || '').toLowerCase()) {
      return fail('err_taken');
    }

    if (company.status === 'pending') {
      company = await applySiteDraft(company, matched.website, locale);
    }

    const purpose = company.status === 'pending' ? 'verify' : 'login';
    const token = await mintToken(company.company_id, matched.email, purpose);
    const verifyPath = `${VERIFY_PATH}?token=${encodeURIComponent(token)}`;
    const link = origin ? `${origin}${verifyPath}` : verifyPath;
    const demoFlow = isDemoDomain(matched.domain) || isDemoCompany(company);

    try {
      await sendVerifyEmail({
        lang: locale,
        to: matched.email,
        link,
        contactName: contactName || company.contact_name,
      });
    } catch (error) {
      if (!demoFlow) throw error;
      console.error('Airsup china test demo verify mail skipped:', error.message);
    }

    await store().updateCompany(company.company_id, { last_email_at: new Date().toISOString() });
    company = await store().getById(company.company_id);

    return {
      ok: true,
      errorKey: null,
      company,
      token,
      verifyPath,
      demo: demoFlow,
    };
  } catch (error) {
    console.error('Airsup china test startSignup error:', error);
    return fail(error.code === 'mail' ? 'err_mail' : 'err_db');
  }
}

/**
 * Same takeToken / verify / login semantics as live GET /verify, but returns
 * data only — no redirect and no session cookie. Caller creates the session.
 *
 * Returns { ok, errorKey, company, purpose }.
 */
async function consumeVerifyToken(token) {
  const raw = String(token || '').trim();
  if (!raw) {
    return { ok: false, errorKey: 'err_token', company: null, purpose: null };
  }

  try {
    const peek = await store().getToken(session.sha256(raw));
    if (!peek || (peek.purpose !== 'verify' && peek.purpose !== 'login')) {
      return { ok: false, errorKey: 'err_token', company: null, purpose: null };
    }

    // Login links stay reusable until expiry (link-preview safe).
    // Verify tokens stay one-shot.
    let row = peek;
    if (peek.purpose === 'verify') {
      row = await store().takeToken(session.sha256(raw));
      if (!row || row.purpose !== 'verify') {
        return { ok: false, errorKey: 'err_token', company: null, purpose: null };
      }
    }
    if (!row || (row.purpose !== 'verify' && row.purpose !== 'login')) {
      return { ok: false, errorKey: 'err_token', company: null, purpose: null };
    }

    const company = await store().getById(row.company_id);
    if (!company) {
      return { ok: false, errorKey: 'err_token', company: null, purpose: row.purpose };
    }

    const lang = company.locale === 'en' ? 'en' : 'zh';
    const patch = {};
    if (company.status === 'pending') {
      patch.contact_email = row.email || company.contact_email;
      patch.status = 'verified';
      patch.verified_at = new Date().toISOString();
    } else if (company.status === 'verified' && row.email) {
      // Keep mailbox aligned only while not live.
      patch.contact_email = row.email;
    }
    // Never change contact_email or status for live.
    if (Object.keys(patch).length) {
      await store().updateCompany(company.company_id, patch);
    }

    let fresh = await store().getById(company.company_id);
    if (fresh && (fresh.status === 'pending' || fresh.status === 'verified')) {
      fresh = await applySiteDraft(fresh, company.website || company.domain, lang) || fresh;
    }

    const profile = normalizeProfile(fresh && fresh.profile);
    const claimReady = Boolean(profile.claim_ready);
    const outreachSource = ['outreach', 'manual'].includes(String((fresh && fresh.source) || ''));
    // Auto-publish only after claim confirm + verify (same as live).
    if (
      fresh
      && row.purpose === 'verify'
      && claimReady
      && outreachSource
      && qualityReady(fresh)
      && fresh.status === 'verified'
      && !fresh.live_at
    ) {
      fresh = await store().updateCompany(fresh.company_id, {
        status: 'live',
        live_at: new Date().toISOString(),
        verified_at: fresh.verified_at || new Date().toISOString(),
        profile: { ...profile, claim_ready: false },
      });
      try {
        await store().touchDomainAllow(fresh.domain, fresh.contact_email, {
          published_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Airsup china test allow publish touch skipped:', error.message);
      }
    }

    return {
      ok: true,
      errorKey: null,
      company: fresh,
      purpose: row.purpose,
    };
  } catch (error) {
    console.error('Airsup china test consumeVerifyToken error:', error);
    return { ok: false, errorKey: 'err_db', company: null, purpose: null };
  }
}

/**
 * Update interaction fields only (WeChat contacts, sample_lead, flexibility,
 * holidays, context, goal) using the same normalizeProfile patterns as live
 * readSetup — without rewriting scrapable site facts.
 */
async function saveInteraction(company, body, lang) {
  if (!company || !company.company_id) {
    throw new Error('saveInteraction requires a company');
  }
  const prev = normalizeProfile(company.profile);
  const src = body && typeof body === 'object' ? body : {};

  let contacts = prev.contacts;
  if (Array.isArray(src.contacts)) {
    contacts = src.contacts;
  } else if (
    src.contact_wechat_0 !== undefined
    || src.contact_name_0 !== undefined
    || src.contact_wechat !== undefined
  ) {
    // Live setup form keys, or a single WeChat shorthand.
    contacts = [0, 1, 2, 3].map((index) => ({
      role: index === 0 ? 'ceo' : 'sales',
      name: src[`contact_name_${index}`] !== undefined
        ? src[`contact_name_${index}`]
        : (prev.contacts[index] && prev.contacts[index].name) || (index === 0 ? src.contact_name : ''),
      wechat: src[`contact_wechat_${index}`] !== undefined
        ? src[`contact_wechat_${index}`]
        : (index === 0 && src.contact_wechat !== undefined
          ? src.contact_wechat
          : (prev.contacts[index] && prev.contacts[index].wechat) || ''),
    }));
  }

  const profile = normalizeProfile({
    ...prev,
    sample_lead: src.sample_lead !== undefined ? src.sample_lead : prev.sample_lead,
    holidays: src.holidays !== undefined ? src.holidays : prev.holidays,
    flexibility: src.flexibility !== undefined ? src.flexibility : prev.flexibility,
    contacts,
    site_notes: prev.site_notes,
    enrichment: prev.enrichment,
    quotation_knowledge: prev.quotation_knowledge,
    claim_ready: prev.claim_ready,
    is_demo: prev.is_demo,
  });

  const patch = {
    profile,
    context: src.context !== undefined ? String(src.context || '').trim() : company.context,
    goal: src.goal !== undefined ? String(src.goal || '').trim() : company.goal,
  };
  if (src.contact_name !== undefined && String(src.contact_name || '').trim()) {
    patch.contact_name = String(src.contact_name).trim();
  }

  // lang reserved for future localized defaults; keep signature stable.
  void lang;

  return store().updateCompany(company.company_id, patch);
}

/**
 * Endpoint-quality gate on top of live canPublish.
 * Live canPublish only needs name/city/capability/goal. Airsup china pitch also
 * asks WeChat + sample lead before publish so ChatGPT can convert buyers.
 */
function qualityReady(company) {
  if (!canPublish(company)) return false;
  const profile = normalizeProfile(company && company.profile);
  return Boolean(listedContacts(profile.contacts).length && String(profile.sample_lead || '').trim());
}

/** Publish when canPublish + qualityReady; else { ok:false, errorKey:'err_publish' }. */
async function publishCompany(company) {
  if (!company || !company.company_id) {
    return { ok: false, errorKey: 'err_publish', company: null };
  }
  if (!qualityReady(company)) {
    return { ok: false, errorKey: 'err_publish', company };
  }
  try {
    const next = await store().updateCompany(company.company_id, {
      status: 'live',
      live_at: company.live_at || new Date().toISOString(),
      verified_at: company.verified_at || new Date().toISOString(),
    });
    try {
      await store().touchDomainAllow(next.domain, next.contact_email || company.contact_email, {
        published_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Airsup china test allow publish touch skipped:', error.message);
    }
    return { ok: true, errorKey: null, company: next };
  } catch (error) {
    console.error('Airsup china test publishCompany error:', error);
    return { ok: false, errorKey: 'err_db', company };
  }
}

/**
 * Compact onboarding progress for the test UI.
 * step: site | email | verify | fields | live
 */
function onboardingState(company, lang) {
  const locale = lang === 'en' ? 'en' : 'zh';
  const profile = normalizeProfile(company && company.profile);
  const status = company ? String(company.status || '') : '';
  const domain = company ? String(company.domain || '') : '';
  const email = company ? String(company.contact_email || '') : '';
  const title = company ? companyTitle(company, locale) : '';
  const publishOk = company ? canPublish(company) : false;
  const ready = company ? qualityReady(company) : false;
  const gaps = company ? enrichmentGaps(company) : [];
  const wechat = (listedContacts(profile.contacts)[0] && listedContacts(profile.contacts)[0].wechat) || '';
  const contactName = company
    ? String(company.contact_name || (profile.contacts[0] && profile.contacts[0].name) || '').trim()
    : '';

  let step = 'site';
  if (!company || !domain) {
    step = 'site';
  } else if (!email) {
    step = 'email';
  } else if (status === 'pending') {
    step = 'verify';
  } else if (status === 'live') {
    step = 'live';
  } else {
    // verified (or paused-from-live as verified) → fill interaction fields
    step = 'fields';
  }

  const previewSummary = [
    title || domain,
    profile.processes.length ? profile.processes.slice(0, 4).join(', ') : '',
    profile.materials.length ? profile.materials.slice(0, 4).join(', ') : '',
    company && company.context ? String(company.context).slice(0, 160) : '',
  ].filter(Boolean).join(' · ');

  return {
    step,
    status: status || null,
    title,
    domain,
    email,
    contactName,
    wechat,
    sampleLead: String(profile.sample_lead || '').trim(),
    flexibility: profile.flexibility || 'normal',
    canPublish: publishOk,
    qualityReady: ready,
    gaps,
    previewSummary,
  };
}

/**
 * Soft wrapper: seed the test note-web from a company, then optionally bump
 * process/material nodes via applyDump hints. Keep simple — concept only.
 */
function seedWebFromCompany(company, lang, web) {
  const locale = lang === 'en' ? 'en' : 'zh';
  let result = seedFromCompany(web || emptyWeb(), company, locale);
  if (!company) return result;

  const profile = normalizeProfile(company.profile);
  const hints = [
    ...(profile.processes || []),
    ...(profile.materials || []),
    profile.sample_lead,
  ].filter(Boolean).join(' ');
  if (!hints.trim()) return result;

  const dumped = applyDump(result.web, { message: hints, files: [], lang: locale });
  return {
    web: dumped.web,
    added: [...(result.added || []), ...(dumped.signals || []).map((s) => s.node)],
    signals: dumped.signals,
    reach: dumped.reach,
  };
}

module.exports = {
  applySiteDraft,
  previewWebsite,
  startSignup,
  consumeVerifyToken,
  saveInteraction,
  publishCompany,
  qualityReady,
  onboardingState,
  seedWebFromCompany,
  readTestCompany,
  openSession,
  clearTestSession,
  usingMemory,
  mintToken,
  // Re-export demo constants helpers may need when wiring test routes.
  DEMO_DOMAIN,
  DEMO_EMAIL,
  ensureDemoCompany,
  ensureDemoAllowlist,
  isDemoDomain,
  isDemoCompany,
};
