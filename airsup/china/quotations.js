const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const {
  normalizeProfile,
  normalizeQuotationKnowledge,
  normalizeExtracted,
  fillEmptyCompany,
  PROCESSES,
  MATERIALS,
} = require('./fields');

const BUCKET = 'airsup-china-quotations';
const MAX_FILES = 10;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.pdf', '.xlsx', '.xls', '.zip', '.csv', '.txt']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/zip',
  'application/x-zip-compressed',
  'text/csv',
  'text/plain',
  'application/octet-stream',
]);

function safeName(name) {
  return String(name || 'file')
    .replace(/[^\w.\u4e00-\u9fff-]+/g, '_')
    .slice(0, 120) || 'file';
}

function extOf(name) {
  return path.extname(String(name || '')).toLowerCase();
}

function isAllowedFile(file) {
  if (!file || !file.buffer) return false;
  if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) return false;
  const ext = extOf(file.originalname);
  if (!ALLOWED_EXT.has(ext)) return false;
  const mime = String(file.mimetype || '').toLowerCase();
  if (mime && !ALLOWED_MIME.has(mime) && mime !== 'application/octet-stream') return false;
  return true;
}

function redactText(text) {
  let out = String(text || '');
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  out = out.replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[phone]');
  out = out.replace(/\b(?:Mr\.|Mrs\.|Ms\.|Miss|先生|女士|经理|总监)\s*[\u4e00-\u9fffA-Za-z]{1,20}/gi, '[person]');
  out = out.replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g, (match) => {
    if (/^(SLA|SLS|FDM|MJF|PDF|STEP|CNC|ISO|PA|ABS|TPU|PLA)$/i.test(match)) return match;
    return '[name]';
  });
  return out.slice(0, 60000);
}

function extractPdfText(buffer) {
  const raw = buffer.toString('latin1');
  const chunks = [];
  const re = /\((?:\\.|[^\\)]){2,200}\)/g;
  let match;
  while ((match = re.exec(raw))) {
    const inner = match[0].slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    if (/[A-Za-z\u4e00-\u9fff]{2,}/.test(inner)) chunks.push(inner);
    if (chunks.length > 4000) break;
  }
  const streamText = raw
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ');
  return redactText(`${chunks.join(' ')}\n${streamText}`.slice(0, 50000));
}

function extractCsvOrText(buffer) {
  return redactText(buffer.toString('utf8').slice(0, 50000));
}

function extractXlsxText(buffer) {
  try {
    // eslint-disable-next-line global-require
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const parts = [];
    for (const name of workbook.SheetNames.slice(0, 8)) {
      const sheet = workbook.Sheets[name];
      parts.push(XLSX.utils.sheet_to_csv(sheet));
    }
    return redactText(parts.join('\n').slice(0, 50000));
  } catch (error) {
    return '';
  }
}

function extractZipText(buffer) {
  try {
    // eslint-disable-next-line global-require
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buffer);
    const parts = [];
    for (const entry of zip.getEntries().slice(0, 40)) {
      if (entry.isDirectory) continue;
      const name = entry.entryName || '';
      const ext = extOf(name);
      if (!ALLOWED_EXT.has(ext) && !['.csv', '.txt', '.pdf', '.xlsx', '.xls'].includes(ext)) continue;
      const nested = entry.getData();
      if (!nested || nested.length > MAX_BYTES) continue;
      parts.push(`--- ${name} ---`);
      parts.push(extractBufferText(nested, name));
      if (parts.join('\n').length > 50000) break;
    }
    return redactText(parts.join('\n').slice(0, 50000));
  } catch (error) {
    return '';
  }
}

function extractBufferText(buffer, filename) {
  const ext = extOf(filename);
  if (ext === '.pdf') return extractPdfText(buffer);
  if (ext === '.xlsx' || ext === '.xls') return extractXlsxText(buffer);
  if (ext === '.zip') return extractZipText(buffer);
  if (ext === '.csv' || ext === '.txt') return extractCsvOrText(buffer);
  return '';
}

function heuristicExtract(text) {
  const lower = String(text || '').toLowerCase();
  const processes = [];
  const materials = [];
  for (const row of PROCESSES) {
    if (lower.includes(row.id) || lower.includes(row.en.toLowerCase()) || text.includes(row.zh)) {
      processes.push(row.id);
    }
  }
  if (/sla|光固化|stereolith/.test(lower)) processes.push('sla');
  if (/sls|尼龙烧结/.test(lower)) processes.push('sls');
  if (/fdm|fff/.test(lower)) processes.push('fdm');
  if (/mjf|multi\s*jet/.test(lower)) processes.push('mjf');
  if (/注塑|injection/.test(lower)) processes.push('injection');
  if (/cnc|铣|machining/.test(lower)) processes.push('3axis');
  for (const row of MATERIALS) {
    if (lower.includes(row.id) || lower.includes(String(row.en).toLowerCase().split(' ')[0])) {
      materials.push(row.id);
    }
  }
  if (/resin|树脂/.test(lower)) materials.push('resin');
  if (/pa12|nylon\s*12|尼龙/.test(lower)) materials.push('pa12');
  if (/tpu/.test(lower)) materials.push('tpu');
  if (/aluminum|aluminium|铝/.test(lower)) materials.push('alu');
  const qty = [];
  const qtyRe = /\b(\d{1,6})\s*(?:pcs|pc|pieces|件|个|套)\b/gi;
  let m;
  while ((m = qtyRe.exec(text)) && qty.length < 8) {
    qty.push(`${m[1]} pcs`);
  }
  const lead = [];
  const leadRe = /(\d{1,3}\s*(?:working\s*)?(?:days?|weeks?|天|周))/gi;
  while ((m = leadRe.exec(text)) && lead.length < 8) {
    lead.push(m[1]);
  }
  return normalizeExtracted({
    processes: Array.from(new Set(processes)).slice(0, 12),
    materials: Array.from(new Set(materials)).slice(0, 12),
    typical_quantities: qty,
    lead_time_phrases: lead,
    tolerances: [],
    buyer_questions: [],
    dfm_notes: [],
    moq: qty[0] || '',
    lead_time: lead[0] || '',
    summary: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    insights_for_endpoint: '',
  });
}

async function llmExtract(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !String(text || '').trim()) return null;
  const processIds = PROCESSES.map((row) => row.id).join(',');
  const materialIds = MATERIALS.map((row) => row.id).join(',');
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
            content: `Extract anonymized manufacturing quotation patterns. Never keep customer names, emails, phone numbers, or buyer company names. Return JSON keys: processes (ids from ${processIds}), materials (ids from ${materialIds}), typical_quantities (string[]), lead_time_phrases (string[]), tolerances (string[]), buyer_questions (string[]), dfm_notes (string[]), moq, lead_time, summary, insights_for_endpoint (short capability patterns only, no prices tied to named customers).`,
          },
          {
            role: 'user',
            content: String(text || '').slice(0, 12000),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      && data.choices[0].message.content;
    if (!content) return null;
    return normalizeExtracted(JSON.parse(content));
  } catch (error) {
    console.error('Airsup china quotation LLM extract skipped:', error.message);
    return null;
  }
}

function mergeExtracted(prev, incoming) {
  const a = normalizeExtracted(prev);
  const b = normalizeExtracted(incoming);
  const uniq = (left, right, max) => Array.from(new Set([...(left || []), ...(right || [])])).slice(0, max);
  return normalizeExtracted({
    processes: uniq(a.processes, b.processes, 12),
    materials: uniq(a.materials, b.materials, 12),
    typical_quantities: uniq(a.typical_quantities, b.typical_quantities, 12),
    lead_time_phrases: uniq(a.lead_time_phrases, b.lead_time_phrases, 12),
    tolerances: uniq(a.tolerances, b.tolerances, 12),
    buyer_questions: uniq(a.buyer_questions, b.buyer_questions, 16),
    dfm_notes: uniq(a.dfm_notes, b.dfm_notes, 16),
    moq: a.moq || b.moq,
    lead_time: a.lead_time || b.lead_time,
    summary: b.summary || a.summary,
    insights_for_endpoint: b.insights_for_endpoint || a.insights_for_endpoint,
  });
}

async function ensureBucket() {
  const client = db.requireDb();
  const { data: buckets } = await client.storage.listBuckets();
  if ((buckets || []).some((row) => row.name === BUCKET)) return;
  const { error } = await client.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message || '')) {
    throw error;
  }
}

function listMeta(company) {
  const knowledge = normalizeQuotationKnowledge(
    company && company.profile && company.profile.quotation_knowledge
  );
  return {
    endpoint_use: knowledge.endpoint_use,
    documents: knowledge.documents.map((row) => ({
      id: row.id,
      name: row.name,
      mime: row.mime,
      size: row.size,
      uploaded_at: row.uploaded_at,
      extracted_at: row.extracted_at,
      status: row.status,
      error: row.error,
    })),
    extracted_summary: knowledge.extracted.summary || '',
    has_insights: Boolean(
      knowledge.extracted.insights_for_endpoint
      || knowledge.extracted.summary
      || knowledge.extracted.typical_quantities.length
    ),
  };
}

async function uploadAndExtract(company, file) {
  if (!isAllowedFile(file)) {
    const err = new Error('unsupported_file');
    err.code = 'unsupported_file';
    throw err;
  }
  const profile = normalizeProfile(company.profile);
  const knowledge = normalizeQuotationKnowledge(profile.quotation_knowledge);
  if (knowledge.documents.length >= MAX_FILES) {
    const err = new Error('too_many_files');
    err.code = 'too_many_files';
    throw err;
  }

  await ensureBucket();
  const docId = crypto.randomUUID();
  const filename = safeName(file.originalname);
  const storagePath = `${company.company_id}/${docId}/${filename}`;
  const client = db.requireDb();
  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype || 'application/octet-stream',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const doc = {
    id: docId,
    name: filename,
    mime: file.mimetype || '',
    size: file.size || file.buffer.length,
    storage_path: storagePath,
    uploaded_at: new Date().toISOString(),
    extracted_at: '',
    status: 'processing',
    error: '',
  };
  knowledge.documents.push(doc);
  knowledge.updated_at = new Date().toISOString();

  let nextCompany = await db.updateCompany(company.company_id, {
    profile: { ...profile, quotation_knowledge: knowledge },
  });

  try {
    const text = extractBufferText(file.buffer, filename);
    if (!String(text || '').trim()) {
      throw new Error('empty_extract');
    }
    const heuristic = heuristicExtract(text);
    const llm = await llmExtract(text);
    const extracted = mergeExtracted(knowledge.extracted, mergeExtracted(heuristic, llm || {}));
    const freshProfile = normalizeProfile(nextCompany.profile);
    const freshKnowledge = normalizeQuotationKnowledge(freshProfile.quotation_knowledge);
    freshKnowledge.documents = freshKnowledge.documents.map((row) => (
      row.id === docId
        ? { ...row, status: 'ready', extracted_at: new Date().toISOString(), error: '' }
        : row
    ));
    freshKnowledge.extracted = extracted;
    freshKnowledge.updated_at = new Date().toISOString();

    const draft = {
      niche: nextCompany.niche,
      profile: {
        processes: extracted.processes,
        materials: extracted.materials,
        moq: extracted.moq,
        lead_time: extracted.lead_time,
      },
    };
    const filled = fillEmptyCompany(nextCompany, draft);
    filled.profile = {
      ...normalizeProfile(filled.profile),
      quotation_knowledge: freshKnowledge,
      enrichment: freshProfile.enrichment,
      site_notes: freshProfile.site_notes,
      contacts: freshProfile.contacts,
      flexibility: freshProfile.flexibility,
      claim_ready: freshProfile.claim_ready,
    };

    nextCompany = await db.updateCompany(company.company_id, {
      niche: filled.niche || nextCompany.niche,
      profile: filled.profile,
      context: filled.context || nextCompany.context,
    });
  } catch (error) {
    const failedProfile = normalizeProfile(nextCompany.profile);
    const failedKnowledge = normalizeQuotationKnowledge(failedProfile.quotation_knowledge);
    failedKnowledge.documents = failedKnowledge.documents.map((row) => (
      row.id === docId
        ? {
          ...row,
          status: 'failed',
          error: String(error.message || 'extract_failed').slice(0, 240),
        }
        : row
    ));
    failedKnowledge.updated_at = new Date().toISOString();
    nextCompany = await db.updateCompany(company.company_id, {
      profile: { ...failedProfile, quotation_knowledge: failedKnowledge },
    });
  }

  return { company: nextCompany, meta: listMeta(nextCompany) };
}

async function deleteDocument(company, docId) {
  const profile = normalizeProfile(company.profile);
  const knowledge = normalizeQuotationKnowledge(profile.quotation_knowledge);
  const target = knowledge.documents.find((row) => row.id === docId);
  if (!target) {
    const err = new Error('not_found');
    err.code = 'not_found';
    throw err;
  }
  if (target.storage_path) {
    try {
      const client = db.requireDb();
      await client.storage.from(BUCKET).remove([target.storage_path]);
    } catch (error) {
      console.error('Airsup china quotation delete storage skipped:', error.message);
    }
  }
  knowledge.documents = knowledge.documents.filter((row) => row.id !== docId);
  knowledge.updated_at = new Date().toISOString();
  const next = await db.updateCompany(company.company_id, {
    profile: { ...profile, quotation_knowledge: knowledge },
  });
  return { company: next, meta: listMeta(next) };
}

async function setEndpointUse(company, enabled) {
  const profile = normalizeProfile(company.profile);
  const knowledge = normalizeQuotationKnowledge(profile.quotation_knowledge);
  knowledge.endpoint_use = Boolean(enabled);
  knowledge.updated_at = new Date().toISOString();
  const next = await db.updateCompany(company.company_id, {
    profile: { ...profile, quotation_knowledge: knowledge },
  });
  return { company: next, meta: listMeta(next) };
}

module.exports = {
  BUCKET,
  MAX_FILES,
  MAX_BYTES,
  isAllowedFile,
  redactText,
  extractBufferText,
  extractPdfText,
  heuristicExtract,
  listMeta,
  uploadAndExtract,
  deleteDocument,
  setEndpointUse,
  mergeExtracted,
};
