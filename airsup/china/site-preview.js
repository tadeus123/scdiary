const { normalizeDomain, isFreeMail } = require('./domain');
const { genericDemo, personalizedDemo, nameFromDomain, guessNiche } = require('./demo');
const { normalizeProfile, normalizeNiche, mapCityId } = require('./fields');

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
    return { ok: false, text: '', title: '', html: '' };
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
      return { ok: false, text: '', title: '', html: '' };
    }
    if (!res.ok) return { ok: false, text: '', title: '', html: '' };
    const buf = await res.arrayBuffer();
    const html = Buffer.from(buf).toString('utf8').slice(0, 400000);
    return { ok: true, text: stripHtml(html), title: titleFromHtml(html), html };
  } catch {
    return { ok: false, text: '', title: '', html: '' };
  } finally {
    clearTimeout(timer);
  }
}

function extraPathsFromHtml(html, domain) {
  const hrefs = String(html || '').match(/href=["']([^"']+)["']/gi) || [];
  const want = /about|capabilit|contact|product|factory|company|process|machine|quality|cert|关于|能力|联系|产品|工厂|简介|设备/i;
  const urls = [];
  const seen = new Set();
  hrefs.forEach((raw) => {
    const href = String(raw).replace(/^href=["']|["']$/gi, '');
    let url;
    try {
      url = new URL(href, `https://${domain}/`);
    } catch {
      return;
    }
    const host = url.hostname.replace(/^www\./, '');
    if (host !== domain) return;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    if (!want.test(`${url.pathname} ${href}`)) return;
    const key = url.pathname.replace(/\/$/, '') || '/';
    if (key === '/' || seen.has(key)) return;
    seen.add(key);
    urls.push(`https://${domain}${url.pathname}`);
  });
  return urls.slice(0, 3);
}

async function fetchOnePage(url, domain) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, {
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
    if (isBlockedHost(finalHost) || isFreeMail(finalHost) || !res.ok) return '';
    const buf = await res.arrayBuffer();
    return stripHtml(Buffer.from(buf).toString('utf8').slice(0, 200000));
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSiteBundle(domain) {
  const home = await fetchSiteText(domain);
  if (!home.ok) return home;
  const extras = extraPathsFromHtml(home.html, domain);
  const extraText = (await Promise.all(extras.map((url) => fetchOnePage(url, domain))))
    .filter(Boolean)
    .join('\n');
  return {
    ok: true,
    title: home.title,
    text: `${home.text}\n${extraText}`.trim().slice(0, 14000),
    pages: 1 + extras.length,
  };
}

async function inferFromText(domain, page) {
  const cityId = mapCityId(`${page.title} ${page.text}`);
  const fallback = {
    companyName: page.title || nameFromDomain(domain),
    companyNameEn: '',
    companyNameZh: '',
    city: cityId === 'other' ? '' : cityId,
    cityId,
    capabilities: [],
    summary: '',
    niche: guessNiche(`${page.title} ${page.text}`),
    profile: normalizeProfile({}),
    siteNotes: String(page.text || '').slice(0, 8000),
    fromSite: Boolean(page.text),
  };
  const key = process.env.OPENAI_API_KEY;
  if (!key || !page.text) return fallback;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract only facts stated on a public manufacturer website. Return JSON with keys: companyNameZh, companyNameEn, city, niche (cnc|injection|pcba|other), processes (ids from 3axis,4axis,5axis,turning,swiss,edm,grinding,sheet,injection,mold,pcba), materials (ids from alu,steel,stainless,titanium,copper,plastic), finishing (ids from anodize,powder,plating,bead,polish,heat), certifications (ids from iso9001,iso13485,as9100,iatf,iso14001), machines, tolerance, max_workpiece, moq, lead_time, shipping, year_founded, employees, address, export_markets, capabilities (string array max 8), summary. Do not invent machines, certificates, prices or lead times. Unknown = empty string or [].',
          },
          {
            role: 'user',
            content: `Domain: ${domain}\nTitle: ${page.title}\nText: ${page.text.slice(0, 12000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const parsed = JSON.parse(String(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '{}'));
    const niche = normalizeNiche(parsed.niche || fallback.niche);
    const cityRaw = String(parsed.city || '');
    const mapped = mapCityId(cityRaw) || fallback.cityId;
    const profile = normalizeProfile({
      year_founded: parsed.year_founded,
      employees: parsed.employees,
      address: parsed.address,
      export_markets: parsed.export_markets,
      other_city: mapped === 'other' ? cityRaw : '',
      processes: parsed.processes,
      materials: parsed.materials,
      finishing: parsed.finishing,
      certifications: parsed.certifications,
      machines: parsed.machines,
      tolerance: parsed.tolerance,
      max_workpiece: parsed.max_workpiece,
      moq: parsed.moq,
      lead_time: parsed.lead_time,
      shipping: parsed.shipping,
      site_notes: String(page.text || '').slice(0, 8000),
    });
    return {
      companyName: String(parsed.companyNameEn || parsed.companyNameZh || fallback.companyName).slice(0, 120),
      companyNameEn: String(parsed.companyNameEn || '').slice(0, 120),
      companyNameZh: String(parsed.companyNameZh || '').slice(0, 120),
      city: cityRaw.slice(0, 80),
      cityId: mapped || 'shenzhen',
      capabilities: Array.isArray(parsed.capabilities)
        ? parsed.capabilities.map((item) => String(item).slice(0, 80)).filter(Boolean).slice(0, 8)
        : [],
      summary: String(parsed.summary || '').slice(0, 600),
      niche: niche === 'other' ? guessNiche(page.text) : niche,
      profile,
      siteNotes: profile.site_notes,
      fromSite: true,
    };
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function companyDraftFromPreview(preview) {
  const cityId = preview.cityId || mapCityId(preview.city) || 'shenzhen';
  const profile = normalizeProfile({
    ...(preview.profile || {}),
    other_city: (preview.profile && preview.profile.other_city) || (cityId === 'other' ? preview.city : ''),
    site_notes: preview.siteNotes || (preview.profile && preview.profile.site_notes) || '',
  });
  return {
    company_name: String(preview.companyNameZh || '').trim(),
    company_name_en: String(preview.companyNameEn || preview.companyName || '').trim(),
    city: cityId,
    niche: preview.niche || 'cnc',
    context: String(preview.summary || '').trim(),
    goal: '',
    profile,
  };
}

const previewCache = new Map();

async function buildPreview(website, lang) {
  const domain = normalizeDomain(website);
  if (!domain) return { ok: false, error: 'err_website' };
  if (isFreeMail(domain) || isBlockedHost(domain)) return { ok: false, error: 'err_website_public' };
  const cacheKey = `${lang}:${domain}`;
  const hit = previewCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  const page = await fetchSiteBundle(domain);
  const inferred = await inferFromText(domain, page);
  const preview = {
    domain,
    website: `https://${domain}`,
    companyName: inferred.companyName || nameFromDomain(domain),
    companyNameEn: inferred.companyNameEn,
    companyNameZh: inferred.companyNameZh,
    city: inferred.city,
    cityId: inferred.cityId || mapCityId(inferred.city),
    capabilities: inferred.capabilities,
    summary: inferred.summary,
    niche: inferred.niche,
    profile: inferred.profile,
    siteNotes: inferred.siteNotes,
    fromSite: inferred.fromSite,
  };
  const data = {
    ok: true,
    ...preview,
    draft: companyDraftFromPreview(preview),
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
  extraPathsFromHtml,
  companyDraftFromPreview,
  mapCityId,
  buildPreview,
};
