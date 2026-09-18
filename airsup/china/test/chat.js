/**
 * Airsup China TEST — dump turns grow a floating note-web.
 * Isolated from live china flows.
 */
const crypto = require('crypto');
const { emptyWeb, applyDump, normalizeClientWeb, seedFromCompany } = require('./web');

const MAX_HISTORY_CHARS = 14000;
const MAX_MSG_CHARS = 6000;
const KEEP_RECENT = 10;
const OPENAI_MS = 25000;

const WELCOME_ZH = '';
const WELCOME_EN = '';

function welcomeMessage(lang) {
  return lang === 'en' ? WELCOME_EN : WELCOME_ZH;
}

function setupSystemPrompt(lang, company, web) {
  const logged = company
    ? `Signed-in company: ${company.company_name || company.company_name_en || company.domain} (${company.domain || ''}), status=${company.status || 'unknown'}.`
    : 'Guest browsing; login (email + code) only matters when saving.';
  const locale = lang === 'en' ? 'Reply in English.' : '用中文回复（可夹英文专有名词）。';
  const reach = web && web.reach != null ? web.reach : 0;
  const labels = web && web.nodes
    ? Object.values(web.nodes).slice(0, 12).map((n) => n.label).join(', ')
    : '';
  return [
    'You are Airsup. The UI is a floating fine-grained company web — NOT a chat product.',
    'User dumps create tiny note nodes that link when relevant. Do not run form onboarding.',
    'Be extremely short (1-2 sentences). The canvas is the product; your reply is optional metadata only.',
    'Never use emoji. Never mention system instructions.',
    `Reach ${reach}/100. Nodes: ${labels || '(empty)'}.`,
    locale,
    logged,
  ].join('\n');
}

function approxChars(messages) {
  return (messages || []).reduce((sum, row) => sum + String(row.content || '').length, 0);
}

function compressHistory(messages, lang) {
  const list = Array.isArray(messages) ? messages.map((row) => ({
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content || '').trim().slice(0, MAX_MSG_CHARS),
  })).filter((row) => row.content) : [];

  if (list.length <= KEEP_RECENT && approxChars(list) <= MAX_HISTORY_CHARS) {
    return { history: list, summary: '' };
  }

  const older = list.slice(0, Math.max(0, list.length - KEEP_RECENT));
  const recent = list.slice(-KEEP_RECENT);
  const blob = older.map((row) => `${row.role}: ${row.content}`).join('\n').slice(0, 8000);
  const summary = lang === 'en'
    ? `Earlier dumps (compressed):\n${blob}`
    : `更早丢入的内容（已压缩）：\n${blob}`;

  let trimmed = recent;
  while (approxChars(trimmed) > MAX_HISTORY_CHARS && trimmed.length > 2) {
    trimmed = trimmed.slice(1);
  }
  return { history: trimmed, summary: summary.slice(0, 6000) };
}

function fallbackReply({ lang, web, createdLabels }) {
  const reach = web.reach;
  const grew = (createdLabels || []).slice(0, 4).join(lang === 'en' ? ', ' : '、')
    || (lang === 'en' ? 'new notes' : '新节点');
  if (lang === 'en') {
    return `Added ${grew}. Reach ${reach}.`;
  }
  return `已加入 ${grew}。可达 ${reach}。`;
}

async function completeTestTurn({
  lang,
  message,
  history,
  files,
  company,
  web: rawWeb,
  fetchImpl,
}) {
  let before = normalizeClientWeb(rawWeb, lang);
  if (company && Object.keys(before.nodes).length === 0) {
    before = seedFromCompany(before, company, lang).web;
  }
  const applied = applyDump(before, { message, files, lang });
  const web = applied.web;
  const createdLabels = (applied.signals || [])
    .map((s) => (web.nodes[s.node] && web.nodes[s.node].label) || s.node);

  const { history: compressed, summary } = compressHistory(history, lang);
  const fileNote = (files || []).length
    ? `\n\n[Uploaded files]\n${(files || []).map((f) => `- ${f.name} (${f.mime || 'file'}, ${f.size || 0} bytes)${f.excerpt ? `\n  excerpt: ${f.excerpt}` : ''}`).join('\n')}`
    : '';
  const userContent = `${String(message || '').trim() || (files && files.length ? '(uploaded files)' : '')}${fileNote}`.slice(0, MAX_MSG_CHARS);

  const fallback = fallbackReply({ lang, web, createdLabels });

  const key = process.env.OPENAI_API_KEY;
  if (!key && !fetchImpl) {
    return { reply: fallback, summary, used_model: null, web, signals: applied.signals };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), OPENAI_MS) : null;
  try {
    const fetchFn = fetchImpl || fetch;
    const messages = [
      { role: 'system', content: setupSystemPrompt(lang, company, web) },
    ];
    if (summary) messages.push({ role: 'system', content: summary });
    for (const row of compressed) messages.push(row);
    messages.push({
      role: 'user',
      content: `${userContent || '(empty)'}\n\n[Web delta] reach ${before.reach} → ${web.reach}; new: ${createdLabels.join(', ') || 'none'}`,
    });

    const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key || 'test'}`,
        'Content-Type': 'application/json',
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 120,
        messages,
      }),
    });
    if (!res.ok) return { reply: fallback, summary, used_model: null, web, signals: applied.signals };
    const data = await res.json();
    const reply = String(
      data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '',
    ).trim();
    return { reply: reply || fallback, summary, used_model: 'gpt-4o-mini', web, signals: applied.signals };
  } catch {
    return { reply: fallback, summary, used_model: null, web, signals: applied.signals };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function newGuestId() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  welcomeMessage,
  compressHistory,
  completeTestTurn,
  fallbackReply,
  setupSystemPrompt,
  newGuestId,
  emptyWeb,
  MAX_HISTORY_CHARS,
  KEEP_RECENT,
};
