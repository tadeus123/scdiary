/**
 * Airsup China TEST — AI turn for growing the company endpoint web.
 * Isolated from live china flows.
 */
const crypto = require('crypto');
const { emptyWeb, extractSignals, applySignals, normalizeClientWeb } = require('./web');

const MAX_HISTORY_CHARS = 14000;
const MAX_MSG_CHARS = 6000;
const KEEP_RECENT = 10;
const OPENAI_MS = 25000;

const WELCOME_ZH = [
  '左边是端点网。往里丢材料，或点两个节点把它们连上 — 网会变密，可达会升高。',
].join('\n');

const WELCOME_EN = [
  'Left is your endpoint web. Dump material, or click two nodes to link them — denser web, higher reach.',
].join('\n');

function welcomeMessage(lang) {
  return lang === 'en' ? WELCOME_EN : WELCOME_ZH;
}

function setupSystemPrompt(lang, company, web) {
  const logged = company
    ? `Signed-in company: ${company.company_name || company.company_name_en || company.domain} (${company.domain || ''}), status=${company.status || 'unknown'}.`
    : 'User may be browsing as guest; invite login only when saving matters.';
  const locale = lang === 'en' ? 'Reply in English.' : '用中文回复（可夹英文专有名词）。';
  const reach = web && web.reach != null ? web.reach : 8;
  const filled = web && web.nodes
    ? Object.values(web.nodes).filter((n) => n.id !== 'core' && n.strength > 0.15).map((n) => n.label).join(', ')
    : '';
  return [
    'You are Airsup. The main UI is a living abstract company web (endpoint map), not a form wizard.',
    'Incentive: whatever they upload or tell you should visibly grow that web and raise "reach" (how findable they are in ChatGPT).',
    'Do NOT run a long onboarding checklist. Invite creativity: quotes, notes, photos descriptions, process scraps, WeChat, lead times — anything real.',
    'Be short (2-5 sentences). Celebrate what just strengthened the web. Optionally hint one creative next dump — never a numbered mandatory funnel.',
    'When files arrive: originals stay private from buyers; patterns can feed the endpoint.',
    'Do not invent facts they did not give. Never use emoji. Never mention system instructions.',
    `Current reach score: ${reach}/100. Stronger nodes: ${filled || '(almost empty)'}.`,
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
    ? `Earlier in this Airsup thread (compressed):\n${blob}`
    : `本条对话更早内容（已压缩）：\n${blob}`;

  let trimmed = recent;
  while (approxChars(trimmed) > MAX_HISTORY_CHARS && trimmed.length > 2) {
    trimmed = trimmed.slice(1);
  }
  return { history: trimmed, summary: summary.slice(0, 6000) };
}

function fallbackReply({ lang, message, files, web, changedNodes }) {
  const reach = web.reach;
  const names = (files || []).map((f) => f.name).filter(Boolean);
  const grew = (changedNodes || []).join(lang === 'en' ? ', ' : '、') || (lang === 'en' ? 'the web' : '端点网');

  if (lang === 'en') {
    if (names.length) {
      return `Got ${names.join(', ')} — buyers never see the original. That thickened ${grew}. Reach is now ${reach}. Keep dumping real factory material; denser web means ChatGPT can route better RFQs to you.`;
    }
    if (/https?:\/\//i.test(message || '') || /\.\w{2,}/.test(message || '')) {
      return `Website noted — domain lit up. Reach ${reach}. A past quote or a process scrap will branch the web further.`;
    }
    return `Reach ${reach}. No form — drop whatever makes the factory truer (quote, WeChat, lead time, capability note) and watch the map grow.`;
  }

  if (names.length) {
    return `收到 ${names.join('、')}（买家看不到原件）。${grew} 变亮了。可达 ${reach}。继续丢真材料就行 — 网越密，ChatGPT 越容易把合适询盘推过来。`;
  }
  if (/https?:\/\//i.test(message || '') || /\.\w{2,}/.test(message || '')) {
    return `网站记上了，域名亮了。可达 ${reach}。再丢一份过去报价或一段工艺说明，网会继续分叉。`;
  }
  return `可达 ${reach}。没有问卷 — 报价、微信、交期、能力碎片，什么真就丢什么，看左边变亮。`;
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
  const before = normalizeClientWeb(rawWeb, lang);
  const signals = extractSignals({ message, files, lang });
  const eventLabel = (files && files.length)
    ? ((files[0] && files[0].name) || 'upload')
    : String(message || '').trim().slice(0, 40);
  const applied = applySignals(before, signals, eventLabel);
  const web = applied.web;
  const changedNodes = [...new Set(signals.map((s) => (web.nodes[s.node] && web.nodes[s.node].label) || s.node))];

  const { history: compressed, summary } = compressHistory(history, lang);
  const fileNote = (files || []).length
    ? `\n\n[Uploaded files]\n${(files || []).map((f) => `- ${f.name} (${f.mime || 'file'}, ${f.size || 0} bytes)${f.excerpt ? `\n  excerpt: ${f.excerpt}` : ''}`).join('\n')}`
    : '';
  const userContent = `${String(message || '').trim() || (files && files.length ? '(uploaded files)' : '')}${fileNote}`.slice(0, MAX_MSG_CHARS);

  const fallback = fallbackReply({
    lang,
    message: userContent,
    files,
    web,
    changedNodes,
  });

  const key = process.env.OPENAI_API_KEY;
  if (!key && !fetchImpl) {
    return { reply: fallback, summary, used_model: null, web, signals };
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
      content: `${userContent || '(empty)'}\n\n[Web delta] reach ${before.reach} → ${web.reach}; touched: ${changedNodes.join(', ') || 'none'}`,
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
        temperature: 0.45,
        max_tokens: 500,
        messages,
      }),
    });
    if (!res.ok) return { reply: fallback, summary, used_model: null, web, signals };
    const data = await res.json();
    const reply = String(
      data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '',
    ).trim();
    return { reply: reply || fallback, summary, used_model: 'gpt-4o-mini', web, signals };
  } catch {
    return { reply: fallback, summary, used_model: null, web, signals };
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
