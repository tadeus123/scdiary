const FREE_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.jp',
  'hotmail.com',
  'outlook.com',
  'outlook.de',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'qq.com',
  'vip.qq.com',
  '163.com',
  '126.com',
  'yeah.net',
  'sina.com',
  'sina.cn',
  'sohu.com',
  'foxmail.com',
  'aliyun.com',
  'aliyun.cn',
  '139.com',
  '189.cn',
  'wo.cn',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.de',
  'web.de',
  'mail.com',
  'aol.com',
  'yandex.com',
  'zoho.com',
  'mail.ru',
]);

function normalizeDomain(input) {
  let value = String(input || '').trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^mailto:/, '');
  if (value.includes('@') && !value.includes('/')) {
    value = value.split('@').pop() || '';
  }
  try {
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    value = new URL(value).hostname;
  } catch {
    value = value.replace(/^https?:\/\//, '').split('/')[0];
  }
  value = value.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return '';
  return value;
}

function emailParts(email) {
  const raw = String(email || '').trim().toLowerCase();
  const match = raw.match(/^([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!match) return null;
  return {
    local: match[1],
    domain: String(match[2]).replace(/^www\./, ''),
    email: `${match[1]}@${String(match[2]).replace(/^www\./, '')}`,
  };
}

function isFreeMail(domain) {
  return FREE_MAIL.has(String(domain || '').toLowerCase());
}

function domainMatches(website, email) {
  const site = normalizeDomain(website);
  const parts = emailParts(email);
  if (!site) return { ok: false, error: 'website' };
  if (!parts) return { ok: false, error: 'email' };
  if (isFreeMail(site)) return { ok: false, error: 'website_public' };
  if (isFreeMail(parts.domain)) return { ok: false, error: 'free_mail' };
  const same = parts.domain === site || parts.domain.endsWith(`.${site}`);
  if (!same) return { ok: false, error: 'mismatch' };
  return {
    ok: true,
    domain: site,
    website: `https://${site}`,
    email: parts.email,
  };
}

function publicWebsite(website, domain) {
  const site = normalizeDomain(website) || String(domain || '').trim().toLowerCase();
  return site ? `https://${site}` : '';
}

module.exports = {
  FREE_MAIL,
  normalizeDomain,
  emailParts,
  isFreeMail,
  domainMatches,
  publicWebsite,
};
