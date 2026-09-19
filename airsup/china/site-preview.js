const { normalizeDomain, isFreeMail } = require('./domain');
const { genericDemo, personalizedDemo, nameFromDomain, guessNiche } = require('./demo');
const { normalizeProfile, normalizeNiche, mapCityId, normalizeEnrichment } = require('./fields');
const {
  heuristicProcessIdsFromText,
  scrapeNicheEnum,
  scrapeProcessEnum,
} = require('./manufacturing-categories');

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);
const PAGE_BUDGET = 10;
const TEXT_BUDGET = 22000;
const PATH_WANT = /about|capabilit|contact|product|factory|company|process|machine|equip|quality|cert|download|\.pdf|设备|证书|实力|关于|能力|联系|产品|工厂|简介|加工|模具|注塑|精密/i;

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

function extractSiteEmails(html, text) {
  const found = new Set();
  const add = (raw) => {
    const value = String(raw || '').trim().toLowerCase().replace(/^mailto:/i, '');
    const match = value.match(/^([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
    if (!match) return;
    const domain = String(match[2]).replace(/^www\./, '').toLowerCase();
    if (isFreeMail(domain)) return;
    found.add(`${match[1].toLowerCase()}@${domain}`);
  };
  const mailto = String(html || '').match(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi) || [];
  mailto.forEach((item) => add(item.replace(/^mailto:/i, '')));
  const plain = String(`${html || ''}\n${text || ''}`).match(
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi
  ) || [];
  plain.forEach(add);
  return Array.from(found).slice(0, 40);
}

function sameHostUrl(href, domain) {
  let url;
  try {
    url = new URL(href, `https://${domain}/`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host !== domain) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url;
}

function extraPathsFromHtml(html, domain, limit = PAGE_BUDGET) {
  const hrefs = String(html || '').match(/href=["']([^"']+)["']/gi) || [];
  const urls = [];
  const seen = new Set();
  hrefs.forEach((raw) => {
    const href = String(raw).replace(/^href=["']|["']$/gi, '');
    const url = sameHostUrl(href, domain);
    if (!url) return;
    if (!PATH_WANT.test(`${url.pathname} ${href}`)) return;
    const key = url.pathname.replace(/\/$/, '') || '/';
    if (key === '/' || seen.has(key)) return;
    seen.add(key);
    urls.push(`${url.protocol}//${domain}${url.pathname}${url.search || ''}`);
  });
  return urls.slice(0, Math.max(1, Number(limit) || PAGE_BUDGET));
}

async function fetchSitemapUrls(domain, limit = 20) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`https://${domain}/sitemap.xml`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/xml,text/xml,text/plain',
        'User-Agent': 'AirsupPreview/1 (https://www.airsup.co/)',
      },
    });
    const finalHost = (() => {
      try {
        return new URL(res.url).hostname.replace(/^www\./, '');
      } catch {
        return domain;
      }
    })();
    if (isBlockedHost(finalHost) || isFreeMail(finalHost) || !res.ok) return [];
    const xml = Buffer.from(await res.arrayBuffer()).toString('utf8').slice(0, 400000);
    const locs = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
    const urls = [];
    const seen = new Set();
    for (const raw of locs) {
      const href = String(raw).replace(/<\/?loc>/gi, '').trim();
      const url = sameHostUrl(href, domain);
      if (!url) continue;
      if (!PATH_WANT.test(`${url.pathname} ${href}`)) continue;
      const key = url.pathname.replace(/\/$/, '') || '/';
      if (key === '/' || seen.has(key)) continue;
      seen.add(key);
      urls.push(`${url.protocol}//${domain}${url.pathname}`);
      if (urls.length >= limit) break;
    }
    return urls;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
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
        'User-Agent': 'AirsupPreview/1 (https://www.airsup.co/)',
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

async function fetchOnePage(url, domain) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,text/plain,application/pdf',
        'User-Agent': 'AirsupPreview/1 (https://www.airsup.co/)',
      },
    });
    const finalHost = (() => {
      try {
        return new URL(res.url).hostname.replace(/^www\./, '');
      } catch {
        return domain;
      }
    })();
    if (isBlockedHost(finalHost) || isFreeMail(finalHost) || !res.ok) {
      return { text: '', url, kind: 'empty' };
    }
    const buf = await res.arrayBuffer();
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const isPdf = contentType.includes('pdf') || /\.pdf(\?|$)/i.test(url);
    if (isPdf) {
      const raw = Buffer.from(buf).toString('latin1').slice(0, 250000);
      const extracted = raw
        .replace(/[^\x20-\x7E\n\r\t\u4e00-\u9fff]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000);
      return { text: extracted, url, kind: 'pdf' };
    }
    return {
      text: stripHtml(Buffer.from(buf).toString('utf8').slice(0, 200000)),
      url,
      kind: 'html',
    };
  } catch {
    return { text: '', url, kind: 'empty' };
  } finally {
    clearTimeout(timer);
  }
}

function heuristicHintsFromText(text) {
  const hay = String(text || '');
  const processes = heuristicProcessIdsFromText(hay).slice();
  const materials = [];
  const certifications = [];
  const lower = hay.toLowerCase();
  if (/5[-\s]?axis|五轴/.test(lower)) processes.push('5axis');
  if (/4[-\s]?axis|四轴/.test(lower)) processes.push('4axis');
  if (/3[-\s]?axis|三轴/.test(lower)) processes.push('3axis');
  if (/6061|7075|aluminum|aluminium|铝/.test(lower)) materials.push('alu');
  if (/stainless|不锈钢/.test(lower)) materials.push('stainless');
  if (/titanium|钛/.test(lower)) materials.push('titanium');
  if (/steel|钢材|碳钢/.test(lower)) materials.push('steel');
  if (/copper|brass|铜|黄铜/.test(lower)) materials.push('copper');
  if (/pom|peek|plastic|塑料/.test(lower)) materials.push('plastic');
  if (/resin|光敏树脂|光固化树脂/.test(lower)) materials.push('resin');
  if (/\bpa12\b|nylon\s*12|尼龙\s*pa\s*12|尼龙12/.test(lower)) materials.push('pa12');
  if (/\btpu\b|弹性体/.test(lower)) materials.push('tpu');
  if (/iso\s*9001|iso9001/.test(lower)) certifications.push('iso9001');
  if (/iso\s*13485|iso13485/.test(lower)) certifications.push('iso13485');
  if (/as9100/.test(lower)) certifications.push('as9100');
  if (/iatf\s*16949|iatf16949/.test(lower)) certifications.push('iatf');
  if (/iso\s*14001|iso14001/.test(lower)) certifications.push('iso14001');
  return {
    processes: Array.from(new Set(processes)),
    materials: Array.from(new Set(materials)),
    certifications: Array.from(new Set(certifications)),
  };
}

function quoteAround(text, needle) {
  const hay = String(text || '');
  const idx = hay.toLowerCase().indexOf(String(needle || '').toLowerCase());
  if (idx < 0) return String(needle || '').slice(0, 120);
  return hay.slice(Math.max(0, idx - 40), idx + 120).trim();
}

async function fetchSiteBundle(domain) {
  const home = await fetchSiteText(domain);
  if (!home.ok) return home;
  const fromHtml = extraPathsFromHtml(home.html, domain, PAGE_BUDGET);
  const fromSitemap = await fetchSitemapUrls(domain, PAGE_BUDGET);
  const seen = new Set();
  const extras = [];
  for (const url of [...fromHtml, ...fromSitemap]) {
    if (seen.has(url)) continue;
    seen.add(url);
    extras.push(url);
    if (extras.length >= PAGE_BUDGET) break;
  }
  const fetched = await Promise.all(extras.map((url) => fetchOnePage(url, domain)));
  const pageTexts = fetched.filter((row) => row && row.text);
  const extraText = pageTexts.map((row) => row.text).join('\n');
  const text = `${home.text}\n${extraText}`.trim().slice(0, TEXT_BUDGET);
  const sources = pageTexts.slice(0, 20).map((row) => ({
    field: 'site_notes',
    url: row.url,
    quote: String(row.text || '').slice(0, 120),
  }));
  return {
    ok: true,
    title: home.title,
    text,
    html: home.html || '',
    siteEmails: extractSiteEmails(home.html, text),
    pages: 1 + pageTexts.length,
    pageUrls: [`https://${domain}/`, ...pageTexts.map((row) => row.url)],
    sources,
  };
}

async function inferFromText(domain, page) {
  const cityId = mapCityId(`${page.title} ${page.text}`);
  const hints = heuristicHintsFromText(page.text);
  const fallback = {
    companyName: page.title || nameFromDomain(domain),
    companyNameEn: '',
    companyNameZh: '',
    city: cityId === 'other' ? '' : cityId,
    cityId,
    capabilities: [],
    summary: '',
    niche: guessNiche(`${page.title} ${page.text}`),
    profile: normalizeProfile({
      processes: hints.processes,
      materials: hints.materials,
      certifications: hints.certifications,
      site_notes: String(page.text || '').slice(0, 8000),
      enrichment: {
        filled_at: new Date().toISOString(),
        crawl_pages: page.pages || 1,
        model: 'heuristic',
        sources: page.sources || [],
      },
    }),
    siteNotes: String(page.text || '').slice(0, 8000),
    fromSite: Boolean(page.text),
  };
  const key = process.env.OPENAI_API_KEY;
  if (!key || !page.text) return fallback;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
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
              `Extract only facts stated on a public manufacturer website. Return JSON with keys: companyNameZh, companyNameEn, city, niche (${scrapeNicheEnum()}), processes (ids from ${scrapeProcessEnum()}), materials (ids from alu,steel,stainless,titanium,copper,plastic,resin,pa12,tpu), finishing (ids from anodize,powder,plating,bead,polish,heat), certifications (ids from iso9001,iso13485,as9100,iatf,iso14001), machines, tolerance, max_workpiece, moq, lead_time, shipping, year_founded, employees, address, export_markets, capabilities (string array max 8), summary, evidence (array of {field, quote} max 12). Do not invent machines, certificates, prices or lead times. Unknown = empty string or []. Biosignal electrodes means EEG/ECG/EMG/wearable sensing, not welding or electrolysis electrodes. Battery manufacturing means cells/packs/BMS factories, not battery resellers. Sintering/powder metallurgy is not SLS/SLA 3D printing.`,
          },
          {
            role: 'user',
            content: `Domain: ${domain}\nTitle: ${page.title}\nText: ${page.text.slice(0, 16000)}`,
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
    const processes = Array.from(new Set([].concat(parsed.processes || [], hints.processes)));
    const materials = Array.from(new Set([].concat(parsed.materials || [], hints.materials)));
    const certifications = Array.from(new Set([].concat(parsed.certifications || [], hints.certifications)));
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
    const sources = [
      ...(page.sources || []),
      ...evidence.slice(0, 12).map((row) => ({
        field: String((row && row.field) || 'context').slice(0, 60),
        url: `https://${domain}/`,
        quote: String((row && row.quote) || '').slice(0, 240) || quoteAround(page.text, row && row.field),
      })),
    ];
    const profile = normalizeProfile({
      year_founded: parsed.year_founded,
      employees: parsed.employees,
      address: parsed.address,
      export_markets: parsed.export_markets,
      other_city: mapped === 'other' ? cityRaw : '',
      processes,
      materials,
      finishing: parsed.finishing,
      certifications,
      machines: parsed.machines,
      tolerance: parsed.tolerance,
      max_workpiece: parsed.max_workpiece,
      moq: parsed.moq,
      lead_time: parsed.lead_time,
      shipping: parsed.shipping,
      site_notes: String(page.text || '').slice(0, 8000),
      enrichment: normalizeEnrichment({
        filled_at: new Date().toISOString(),
        crawl_pages: page.pages || 1,
        model: 'gpt-4o-mini',
        sources,
      }),
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
    niche: preview.niche || 'other',
    context: String(preview.summary || '').trim(),
    goal: '',
    profile,
  };
}

const previewCache = new Map();

async function buildPreview(website, lang, options = {}) {
  const domain = normalizeDomain(website);
  if (!domain) return { ok: false, error: 'err_website' };
  if (isFreeMail(domain) || isBlockedHost(domain)) return { ok: false, error: 'err_website_public' };
  const skipCache = Boolean(options && options.skipCache);
  const cacheKey = `${lang}:${domain}`;
  if (!skipCache) {
    const hit = previewCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  }
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
    siteEmails: Array.isArray(page.siteEmails) ? page.siteEmails : extractSiteEmails(page.html, page.text),
    fromSite: inferred.fromSite,
    crawlPages: page.pages || 1,
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
  extractSiteEmails,
  fetchSiteText,
  extraPathsFromHtml,
  fetchSitemapUrls,
  heuristicHintsFromText,
  companyDraftFromPreview,
  mapCityId,
  buildPreview,
  PAGE_BUDGET,
};
