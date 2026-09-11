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

function proofPayload(rows) {
  const counts = countsFromRows(rows);
  const line = proofLines(counts);
  const recent = (Array.isArray(rows) ? rows : [])
    .filter((row) => row.status === 'live' && row.live_at && row.domain)
    .sort((a, b) => new Date(b.live_at).getTime() - new Date(a.live_at).getTime())
    .slice(0, 8)
    .map((row) => ({
      domain: row.domain,
      niche: row.niche || '',
      name: row.company_name_en || row.company_name || row.domain,
    }));
  return { ...counts, line_zh: line.zh, line_en: line.en, recent };
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
};
