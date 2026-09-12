const { NICHES } = require('./fields');

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function countsFromRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    started: list.length,
    verified: list.filter((row) => row.verified_at || row.status === 'verified' || row.status === 'live').length,
    live: list.filter((row) => row.status === 'live' && row.live_at).length,
  };
}

function proofLines({ started, verified, live }) {
  const nLive = Number(live) || 0;
  const nVerified = Number(verified) || 0;
  const nStarted = Number(started) || 0;
  if (nLive >= 50) {
    return {
      zh: `采购商已可通过 Airsup 联系 ${nLive} 家已验证的出口制造商。`,
      en: `Buyers can already reach ${nLive} verified export manufacturers through Airsup.`,
    };
  }
  if (nVerified >= 10) {
    return {
      zh: `已有 ${nVerified} 家出口制造商完成验证并接入。`,
      en: `${nVerified} verified export manufacturers are already connected.`,
    };
  }
  if (nStarted > 0) {
    return {
      zh: `我目前人在中国，已在与 ${nStarted} 家出口供应商沟通此事。`,
      en: `I am in China right now and already talking with ${nStarted} export suppliers about this.`,
    };
  }
  return {
    zh: '我们正在开通深圳、东莞第一批出口厂家，让西方买家能通过 AI 找到他们。',
    en: 'We are currently onboarding the first export factories in Shenzhen/Dongguan so Western buyers can find them in AI.',
  };
}

function shanghaiDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftDay(day, delta) {
  const parts = String(day || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !n && n !== 0)) return '';
  const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + delta));
  return next.toISOString().slice(0, 10);
}

function formatChartDay(day, lang) {
  const parts = String(day || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0]) return String(day || '');
  if (lang === 'en') return `${parts[2]} ${MONTHS_EN[parts[1] - 1] || ''}`.trim();
  return `${parts[1]}月${parts[2]}日`;
}

function nicheCopy(id) {
  const found = NICHES.find((item) => item.id === id);
  if (found) return { niche: found.id, niche_zh: found.zh, niche_en: found.en };
  const raw = String(id || '').trim();
  return { niche: raw, niche_zh: raw, niche_en: raw };
}

function liveRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row.status === 'live' && row.live_at && row.domain)
    .sort((a, b) => new Date(b.live_at).getTime() - new Date(a.live_at).getTime())
    .map((row) => {
      const niche = nicheCopy(row.niche);
      return {
        domain: row.domain,
        website: row.website || `https://${row.domain}`,
        name: row.company_name_en || row.company_name || row.domain,
        name_zh: row.company_name || row.company_name_en || row.domain,
        live_at: row.live_at,
        city: row.city || '',
        ...niche,
      };
    });
}

function liveSeries(rows, now) {
  const lives = (Array.isArray(rows) ? rows : [])
    .filter((row) => row.status === 'live' && row.live_at)
    .map((row) => shanghaiDay(row.live_at))
    .filter(Boolean)
    .sort();
  const today = shanghaiDay(now || new Date());
  if (!today) return [];
  if (!lives.length) return [{ day: today, count: 0 }];
  const byDay = new Map();
  lives.forEach((day) => {
    byDay.set(day, (byDay.get(day) || 0) + 1);
  });
  const series = [];
  let cursor = lives[0];
  let total = 0;
  series.push({ day: cursor, count: 0 });
  while (cursor && cursor <= today) {
    total += byDay.get(cursor) || 0;
    series.push({ day: cursor, count: total });
    const next = shiftDay(cursor, 1);
    if (!next || next === cursor) break;
    cursor = next;
  }
  return series;
}

function chartFromSeries(series) {
  const rows = Array.isArray(series) ? series.filter((row) => row && row.day) : [];
  if (!rows.length) return null;
  const width = 640;
  const height = 220;
  const left = 44;
  const right = 16;
  const top = 18;
  const bottom = 42;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const max = Math.max(1, ...rows.map((row) => Number(row.count) || 0));
  const plot = rows.slice();
  if (plot.length === 1) {
    plot.push({ day: plot[0].day, count: plot[0].count });
  }
  const points = plot.map((row, index) => {
    const x = left + (index / Math.max(plot.length - 1, 1)) * innerW;
    const y = top + innerH - ((Number(row.count) || 0) / max) * innerH;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, day: row.day, count: row.count };
  });
  const line = points.map((row) => `${row.x},${row.y}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${first.x},${top + innerH} ${line} ${last.x},${top + innerH}`;
  const labels = [{
    x: first.x,
    day: rows[0].day,
    count: rows[0].count,
    first: true,
  }];
  if (rows.length > 1) {
    labels.push({
      x: last.x,
      day: rows[rows.length - 1].day,
      count: rows[rows.length - 1].count,
      last: true,
    });
  }
  if (rows.length > 3) {
    const mid = rows[Math.floor(rows.length / 2)];
    const match = points.find((point) => point.day === mid.day);
    if (match && mid.day !== rows[0].day && mid.day !== rows[rows.length - 1].day) {
      labels.splice(1, 0, { x: match.x, day: mid.day, count: mid.count });
    }
  }
  return {
    width,
    height,
    max,
    line,
    area,
    baseline: top + innerH,
    left,
    labels,
    yTicks: [
      { y: top + innerH, label: '0' },
      { y: top, label: String(max) },
    ],
  };
}

function proofPayload(rows) {
  const counts = countsFromRows(rows);
  const line = proofLines(counts);
  const recent = liveRows(rows);
  const series = liveSeries(rows);
  return {
    ...counts,
    line_zh: line.zh,
    line_en: line.en,
    recent,
    series,
    chart: chartFromSeries(series),
  };
}

function liveRoster(rows, now) {
  const factories = liveRows(rows).map((row) => ({
    domain: row.domain,
    website: row.website,
    name: row.name,
    name_zh: row.name_zh,
    city: row.city || '',
    category: row.niche,
    category_en: row.niche_en,
    category_zh: row.niche_zh,
    live_at: row.live_at,
    status: 'live',
  }));
  return {
    meaning: 'published_live_endpoint',
    note: 'Only factories that completed signup and published an endpoint appear here. Match pipeline rows by domain. Do not ask these companies to sign up again.',
    fetched_at: (now || new Date()).toISOString(),
    live: factories.length,
    factories,
  };
}

function industryPeers(recent, { niche, domain } = {}) {
  const self = String(domain || '').replace(/^www\./, '').toLowerCase();
  const want = String(niche || '').trim();
  return (Array.isArray(recent) ? recent : []).filter((row) => {
    const host = String(row.domain || '').replace(/^www\./, '').toLowerCase();
    if (self && host === self) return false;
    if (want && row.niche && row.niche !== want) return false;
    if (want && !row.niche) return false;
    return true;
  });
}

module.exports = {
  countsFromRows,
  proofLines,
  proofPayload,
  industryPeers,
  liveSeries,
  liveRows,
  liveRoster,
  chartFromSeries,
  formatChartDay,
  shanghaiDay,
};
