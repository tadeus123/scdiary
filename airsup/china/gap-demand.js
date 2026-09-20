'use strict';

/**
 * Unmatched buyer demand → ops outreach → claim with demand_id.
 * Never invent RFQs. Only record real find_people gaps.
 */
const { routeQueryToCategory, isBroadFactoryQuery } = require('./manufacturing-categories');

const GAP_NOTE =
  'No live Airsup factory currently looks able to fulfill this need. Tell the buyer honestly: none of the onboarded factories can take this yet; Airsup is opening the request to matching suppliers. Do not invent a factory answer.';

function looksLikeFulfillmentNeed(query) {
  const q = String(query || '').trim();
  if (!q) return false;
  const routed = routeQueryToCategory(q);
  if (routed && routed !== 'other') return true;
  if (/\b(rfq|quote|moq|tolerance|qty|quantity|pcs|pieces|lead\s*time|budget|usd|\$|需要|询价|交期|报价|公差)\b/i.test(q)) {
    return true;
  }
  // Specific manufacturing ask, not "how many factories"
  if (isBroadFactoryQuery(q) && !/\b(how many|count|total|多少家|几家)\b/i.test(q)) {
    return Boolean(routed) || /\b(cnc|pcba|smt|injection|anodiz|sheet\s*metal|铸造|注塑|机加)\b/i.test(q);
  }
  return false;
}

function extractHints(query) {
  const raw = String(query || '').trim();
  const process_hint = routeQueryToCategory(raw) || '';
  const qtyMatch = raw.match(/\b(\d[\d,]*)\s*(?:pcs|pieces|units|qty|件|个)\b/i)
    || raw.match(/\bqty[:\s]+(\d[\d,]*)/i)
    || raw.match(/\bquantity[:\s]+(\d[\d,]*)/i);
  const budgetMatch = raw.match(/(?:\$|usd\s*)(\d[\d,]*(?:\.\d+)?)/i)
    || raw.match(/\b(?:budget|pay|price)\s*(?:of|is|:)?\s*\$?\s*(\d[\d,]*)/i);
  return {
    process_hint,
    qty: qtyMatch ? qtyMatch[1].replace(/,/g, '') : '',
    budget: budgetMatch ? budgetMatch[1].replace(/,/g, '') : '',
    need_summary: raw.slice(0, 800),
  };
}

function meaningfulScore(company, query, scoreCompany) {
  const broad = isBroadFactoryQuery(query);
  const score = Number(scoreCompany(company, query) || 0);
  // scoreCompany may pad broad queries to 1 — treat that as non-meaningful alone
  if (broad && score <= 1) {
    const hay = String(
      (company && (company.company_name_en || company.company_name || company.domain)) || ''
    ).toLowerCase();
    const routed = routeQueryToCategory(query);
    if (routed && routed !== 'other' && String(company.niche || '') === routed) return score;
    if (score <= 1 && !hay.includes(String(query || '').toLowerCase().slice(0, 12))) return 0;
  }
  return score;
}

async function recordGapIfNeeded(store, { query, callerPersonId, chinaMatches, scoreCompany }) {
  if (!store || typeof store.insertGapDemand !== 'function') return null;
  if (!looksLikeFulfillmentNeed(query)) return null;
  const matches = Array.isArray(chinaMatches) ? chinaMatches : [];
  const best = matches.reduce((max, row) => Math.max(max, Number(row && row.score) || 0), 0);
  // Gap when no meaningful china hit (score < 2 after padding stripped by find.js)
  if (best >= 3) return null;
  const hints = extractHints(query);
  try {
    const row = await store.insertGapDemand({
      query: String(query || '').slice(0, 1000),
      need_summary: hints.need_summary,
      budget: hints.budget,
      qty: hints.qty,
      process_hint: hints.process_hint,
      caller_person_id: callerPersonId || null,
      status: 'open',
      meta: { best_china_score: best, live_sample: matches.slice(0, 5).map((m) => ({
        person_id: m.person_id,
        name: m.name,
        score: m.score,
      })) },
    });
    return row;
  } catch (error) {
    console.error('Airsup china gap demand skipped:', error.message);
    return null;
  }
}

function draftOutreachEmail({ demand, domain, claimLink, lang }) {
  const d = demand || {};
  const need = String(d.need_summary || d.query || '').trim() || 'a manufacturing project';
  const qty = String(d.qty || '').trim();
  const budget = String(d.budget || '').trim();
  const processHint = String(d.process_hint || '').trim();
  const link = String(claimLink || '').trim();
  const en = lang === 'en';

  if (en) {
    const lines = [
      `Hello${domain ? ` (${domain})` : ''},`,
      '',
      'This is a real Airsup customer request. None of the factories currently live on Airsup can fulfill it.',
      '',
      `Customer need: ${need}`,
    ];
    if (processHint) lines.push(`Process hint: ${processHint}`);
    if (qty) lines.push(`Quantity: ${qty}`);
    if (budget) lines.push(`Budget signal: about USD ${budget}`);
    lines.push(
      '',
      'Please onboard on Airsup and quote this job so we can deliver for the customer.',
      link ? `Claim / onboard: ${link}` : 'Reply to this email and we will send your claim link.',
      '',
      'Tade Mehl',
      'Airsup',
    );
    return {
      subject: 'Real Airsup customer need — please onboard and quote',
      text: lines.join('\n'),
    };
  }

  const lines = [
    `您好${domain ? `（${domain}）` : ''}：`,
    '',
    '这是 Airsup 上的真实客户需求。目前已上线的工厂都无法承接。',
    '',
    `客户需求：${need}`,
  ];
  if (processHint) lines.push(`工艺提示：${processHint}`);
  if (qty) lines.push(`数量：${qty}`);
  if (budget) lines.push(`预算信号：约 USD ${budget}`);
  lines.push(
    '',
    '请完成 Airsup 认领/上线并报价，帮我们服务好这位客户。',
    link ? `认领链接：${link}` : '请回复本邮件，我们会发认领链接。',
    '',
    'Tade Mehl',
    'Airsup',
  );
  return {
    subject: 'Airsup 真实客户需求 — 请认领并报价',
    text: lines.join('\n'),
  };
}

module.exports = {
  GAP_NOTE,
  looksLikeFulfillmentNeed,
  extractHints,
  meaningfulScore,
  recordGapIfNeeded,
  draftOutreachEmail,
};
