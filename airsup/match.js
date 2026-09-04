const { supabase, listActiveEndpoints, upsertKnowledge, listKnowledge } = require('./db');
const { embed, isOpenAiConfigured } = require('./openai');
const { knowledgeDocument, nameMatchScore, keywordScore, publicPerson } = require('./knowledge');

function queryText(args) {
  return [
    args.query,
    args.currentNeed,
    args.whatRequesterCanOffer,
    args.desiredPerson,
  ].filter((part) => String(part || '').trim()).join('\n');
}

function evidenceFrom(row) {
  const person = publicPerson(row);
  if (!person) return null;
  return {
    endpoint_id: person.endpoint_id,
    name: person.name,
    ai_endpoint_email: person.ai_endpoint_email,
    knowledge: person.knowledge,
  };
}

async function findPeople({
  requesterId,
  query,
  currentNeed,
  whatRequesterCanOffer,
  desiredPerson,
  maximumResults = 3,
  rows,
}) {
  const exclude = String(requesterId || '').trim();
  const people = (rows || await listActiveEndpoints())
    .filter((row) => row && row.endpoint_id !== exclude);
  const limit = Math.min(Math.max(Number(maximumResults) || 3, 1), 8);
  const text = queryText({ query, currentNeed, whatRequesterCanOffer, desiredPerson }) || query || '';

  if (!people.length) {
    return { matches: [], note: 'No other listed endpoints yet.' };
  }

  await Promise.all(people.map((row) => upsertKnowledge(row).catch(() => null)));

  const scores = new Map(people.map((row) => [row.endpoint_id, 0]));
  for (const row of people) {
    const nameHits = nameMatchScore(row, text);
    if (nameHits) scores.set(row.endpoint_id, scores.get(row.endpoint_id) + nameHits * 5);
    scores.set(
      row.endpoint_id,
      scores.get(row.endpoint_id) + keywordScore(knowledgeDocument(row), text)
    );
  }

  if (isOpenAiConfigured() && String(text).trim()) {
    try {
      const vector = await embed(text);
      if (vector) {
        const { data, error } = await supabase.rpc('airsup_match_people', {
          query_embedding: vector,
          match_count: Math.max(limit, 8),
          exclude_endpoint: exclude || null,
        });
        if (!error && Array.isArray(data)) {
          for (const hit of data) {
            const id = String(hit.endpoint_id || '');
            if (!scores.has(id)) continue;
            scores.set(id, scores.get(id) + (Number(hit.score) || 0) * 4);
          }
        } else {
          const stored = await listKnowledge();
          for (const row of stored) {
            const id = String(row.endpoint_id || '');
            if (!scores.has(id) || !Array.isArray(row.embedding)) continue;
            scores.set(id, scores.get(id) + cosine(vector, row.embedding) * 4);
          }
        }
      }
    } catch (error) {
      console.error('Airsup vector search fallback:', error.message || error);
    }
  }

  const ranked = people
    .map((row) => ({ row, score: scores.get(row.endpoint_id) || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => {
      const person = evidenceFrom(row);
      if (!person) return null;
      return {
        ...person,
        score: Math.round(score * 100) / 100,
      };
    })
    .filter(Boolean);

  return {
    matches: ranked,
    note: 'Matches use each person’s real public answers, not generated cards. Intimate answers are not searchable. To talk, start_call then keep session_sync in this chat. Gmail is only the doorbell.',
  };
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { findPeople };
