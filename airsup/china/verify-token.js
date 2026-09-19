'use strict';

async function findCompanyByEmail(store, email) {
  const want = String(email || '').trim().toLowerCase();
  if (!want || typeof store.listCompanies !== 'function') return null;
  const all = await store.listCompanies();
  const hits = (all || []).filter((row) => String(row.contact_email || '').toLowerCase() === want);
  return hits[0] || null;
}

async function peekVerifyToken(store, session, rawToken) {
  const raw = String(rawToken || '').trim();
  if (!raw || !store) {
    return { ok: false, errorKey: 'err_token', company: null, purpose: null, email: '', tokenRow: null };
  }
  const peek = await store.getToken(session.sha256(raw));
  if (!peek || (peek.purpose !== 'verify' && peek.purpose !== 'login')) {
    return { ok: false, errorKey: 'err_token', company: null, purpose: null, email: '', tokenRow: null };
  }
  const company = await store.getById(peek.company_id);
  if (!company) {
    return { ok: false, errorKey: 'err_token', company: null, purpose: peek.purpose, email: '', tokenRow: peek };
  }
  return {
    ok: true,
    errorKey: null,
    company,
    purpose: peek.purpose,
    email: peek.email || company.contact_email || '',
    tokenRow: peek,
  };
}

async function applyVerifiedPatch(store, company, email, lang, applySiteDraft) {
  const patch = {};
  if (company.status === 'pending') {
    patch.contact_email = email || company.contact_email;
    patch.status = 'verified';
    patch.verified_at = new Date().toISOString();
  } else if (company.status === 'verified' && email) {
    patch.contact_email = email;
  }
  if (Object.keys(patch).length) {
    await store.updateCompany(company.company_id, patch);
  }
  let fresh = await store.getById(company.company_id);
  if (fresh && (fresh.status === 'pending' || fresh.status === 'verified') && applySiteDraft) {
    fresh = await applySiteDraft(fresh, company.website || company.domain, lang) || fresh;
  }
  return fresh;
}

async function confirmVerifyToken(store, session, {
  token,
  email,
  code,
  verifyCodeFn,
  applySiteDraft,
} = {}) {
  const raw = String(token || '').trim();
  const codeDigits = String(code || '').trim();
  const mail = String(email || '').trim().toLowerCase();

  if (codeDigits && mail && typeof verifyCodeFn === 'function') {
    if (!verifyCodeFn(mail, codeDigits)) {
      return { ok: false, errorKey: 'err_token', company: null, purpose: null };
    }
    let company = null;
    let purpose = 'verify';
    if (raw) {
      const peeked = await peekVerifyToken(store, session, raw);
      if (peeked.ok) {
        company = peeked.company;
        purpose = peeked.purpose;
        if (purpose === 'verify') {
          await store.takeToken(session.sha256(raw));
        }
      }
    }
    if (!company) company = await findCompanyByEmail(store, mail);
    if (!company) return { ok: false, errorKey: 'err_token', company: null, purpose: null };
    const lang = company.locale === 'en' ? 'en' : 'zh';
    const fresh = await applyVerifiedPatch(store, company, mail || company.contact_email, lang, applySiteDraft);
    return { ok: true, errorKey: null, company: fresh, purpose };
  }

  const peeked = await peekVerifyToken(store, session, raw);
  if (!peeked.ok) return peeked;

  let row = peeked.tokenRow;
  if (peeked.purpose === 'verify') {
    row = await store.takeToken(session.sha256(raw));
    if (!row || row.purpose !== 'verify') {
      return { ok: false, errorKey: 'err_token', company: null, purpose: null };
    }
  }
  const company = peeked.company;
  const lang = company.locale === 'en' ? 'en' : 'zh';
  const nextEmail = (row && row.email) || company.contact_email;
  const fresh = await applyVerifiedPatch(store, company, nextEmail, lang, applySiteDraft);
  return { ok: true, errorKey: null, company: fresh, purpose: peeked.purpose };
}

module.exports = {
  peekVerifyToken,
  confirmVerifyToken,
};
