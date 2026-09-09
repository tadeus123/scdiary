const { normalizeDomain, isFreeMail } = require('./domain');
const { genericDemo, personalizedDemo, nameFromDomain, guessNiche } = require('./demo');

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);

function isPrivateIp(host) {
  const value = String(host || '');
  if (value === '::1' || value === '0.0.0.0') return true;
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isBlockedHost(host) {
  const hostName = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!hostName) return true;
  if (BLOCKED_HOSTS.has(hostName)) return true;
  if (hostName.endsWith('.local') || hostName.endsWith('.internal')) return true;
  if (isPrivateIp(hostName)) return true;
  return false;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

function titleFromHtml(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? String(match[1]).replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}

async function fetchSiteText(domain) {
  if (!domain || isBlockedHost(domain) || isFreeMail(domain)) {
    return { ok: false, text: '', title: '' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(`https://${domain}/`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,text/plain',
        'User-Agent': 'AirsupPreview/1 (https://www.tademehl.com/airsup/china)',
      },
    });
    const finalHost = (() => {
      try {
        return new URL(res.url).hostname.replace(/^www\./, '');
      } catch {
        return domain;
      }
    })();
    if (isBlockedHost(finalHost) || isFreeMail(finalHost)) {
      return { ok: false, text: '', title: '' };
    }
    if (!res.ok) return { ok: false, text: '', title: '' };
    const buf = await res.arrayBuffer();
    const html = Buffer.from(buf).toString('utf8').slice(0, 400000);
    return { ok: true, text: stripHtml(html), title: titleFromHtml(html) };
  } catch {
    return { ok: false, text: '', title: '' };
  } finally {
    clearTimeout(timer);
  }
}

async function inferFromText(domain, page) {
  const fallback = {
    companyName: page.title || nameFromDomain(domain),
    city: '',
    capabilities: [],
    summary: '',
    niche: guessNiche(`${page.title} ${page.text}`),
    fromSite: Boolean(page.text),
  };
  const key = process.env.OPENAI_API_KEY;
  if (!key || !page.text) return fallback;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract only facts stated on a public manufacturer website. Return JSON: companyName, city, niche (cnc|injection|pcba|other), capabilities (string array, max 5), summary. Do not invent machines, certificates, prices or lead times. If unknown, use empty strings or [].',
          },
          {
            role: 'user',
            content: `Domain: ${domain}\nTitle: ${page.title}\nText: ${page.text.slice(0, 6000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const parsed = JSON.parse(String(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '{}'));
    const niche = ['cnc', 'injection', 'pcba', 'other'].includes(parsed.niche) ? parsed.niche : fallback.niche;
    return {
      companyName: String(parsed.companyName || fallback.companyName).slice(0, 120),
      city: String(parsed.city || '').slice(0, 80),
      capabilities: Array.isArray(parsed.capabilities)
        ? parsed.capabilities.map((item) => String(item).slice(0, 80)).filter(Boolean).slice(0, 5)
        : [],
      summary: String(parsed.summary || '').slice(0, 280),
      niche: niche === 'other' ? guessNiche(page.text) : niche,
      fromSite: true,
    };
  } catch {
    return fallback;
  }
}

const previewCache = new Map();

async function buildPreview(website, lang) {
  const domain = normalizeDomain(website);
  if (!domain) return { ok: false, error: 'err_website' };
  if (isFreeMail(domain) || isBlockedHost(domain)) return { ok: false, error: 'err_website_public' };
  const cacheKey = `${lang}:${domain}`;
  const hit = previewCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  const page = await fetchSiteText(domain);
  const inferred = await inferFromText(domain, page);
  const preview = {
    domain,
    website: `https://${domain}`,
    companyName: inferred.companyName || nameFromDomain(domain),
    city: inferred.city,
    capabilities: inferred.capabilities,
    summary: inferred.summary,
    niche: inferred.niche,
    fromSite: inferred.fromSite,
  };
  const data = {
    ok: true,
    ...preview,
    demo: personalizedDemo(lang, preview),
    generic: genericDemo(lang),
  };
  previewCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

module.exports = {
  isPrivateIp,
  isBlockedHost,
  stripHtml,
  fetchSiteText,
  buildPreview,
};
