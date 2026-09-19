'use strict';

/**
 * Track real buyer↔factory project outcomes and promote confirmed ones into facts.
 */
const OUTCOME_EVENTS = new Set(['quoted', 'accepted', 'delayed', 'shipped', 'paid', 'note', 'cancelled']);

function detectOutcomes(message, reply) {
  const combined = `${String(message || '')}\n${String(reply || '')}`;
  const found = [];
  if (/\b(quote|quotation|unit\s*price|报价|单价)\b/i.test(combined) && /\$|\busd\b|\bcny\b|元|￥/i.test(combined)) {
    found.push({ event: 'quoted', detail: 'price signal in thread', evidence: combined.slice(0, 500) });
  }
  if (/\b(accept(ed)?|award(ed)?|go\s*ahead|请下单|接受报价|成交)\b/i.test(combined)) {
    found.push({ event: 'accepted', detail: 'acceptance signal in thread', evidence: combined.slice(0, 500) });
  }
  if (/\b(delay(ed)?|late|behind\s*schedule|延期|延误|推迟)\b/i.test(combined)) {
    found.push({ event: 'delayed', detail: 'delay signal in thread', evidence: combined.slice(0, 500) });
  }
  if (/\b(ship(ped)?|dispatch(ed)?|delivered|发货|已寄出|到货)\b/i.test(combined)) {
    found.push({ event: 'shipped', detail: 'shipment signal in thread', evidence: combined.slice(0, 500) });
  }
  if (/\b(paid|payment\s*received|已付款|收到货款)\b/i.test(combined)) {
    found.push({ event: 'paid', detail: 'payment signal in thread', evidence: combined.slice(0, 500) });
  }
  const lead = combined.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*days?/i) || combined.match(/(\d+)\s*days?/i);
  if (lead && /\b(lead\s*time|交期|天到货|working\s*days)\b/i.test(combined)) {
    found.push({
      event: 'note',
      detail: `lead_time_days:${lead[2] || lead[1]}`,
      evidence: combined.slice(0, 500),
    });
  }
  return found;
}

function factsFromOutcomes(events, projectId) {
  const rows = [];
  for (const ev of events || []) {
    if (!ev || !OUTCOME_EVENTS.has(ev.event)) continue;
    if (ev.event === 'note' && String(ev.detail || '').startsWith('lead_time_days:')) {
      const days = String(ev.detail).split(':')[1];
      rows.push({
        fact_type: 'commercial',
        fact_key: 'observed_lead_time_days',
        value: days,
        unit: 'days',
        confidence: 0.75,
        supplier_confirmed: false,
        visibility: 'buyer',
        source_type: 'project_outcome',
        source_reference: projectId || '',
      });
    }
    if (ev.event === 'quoted') {
      rows.push({
        fact_type: 'commercial',
        fact_key: 'has_quoted_jobs',
        value: 'true',
        confidence: 0.8,
        supplier_confirmed: false,
        visibility: 'ops',
        source_type: 'project_outcome',
        source_reference: projectId || '',
      });
    }
    if (ev.event === 'shipped') {
      rows.push({
        fact_type: 'commercial',
        fact_key: 'has_shipped_jobs',
        value: 'true',
        confidence: 0.85,
        supplier_confirmed: false,
        visibility: 'buyer',
        source_type: 'project_outcome',
        source_reference: projectId || '',
      });
    }
    if (ev.event === 'delayed') {
      rows.push({
        fact_type: 'buyer_perf',
        fact_key: 'had_delivery_delay',
        value: 'true',
        confidence: 0.7,
        supplier_confirmed: false,
        visibility: 'ops',
        source_type: 'project_outcome',
        source_reference: projectId || '',
      });
    }
    if (ev.event === 'accepted' || ev.event === 'paid') {
      rows.push({
        fact_type: 'commercial',
        fact_key: 'completed_orders_signal',
        value: ev.event,
        confidence: 0.8,
        supplier_confirmed: false,
        visibility: 'ops',
        source_type: 'project_outcome',
        source_reference: projectId || '',
      });
    }
  }
  return rows;
}

async function ensureProject(store, { companyId, conversationId, inquiryId, demandId, title }) {
  if (!store || typeof store.getProjectByConversation !== 'function') return null;
  if (conversationId) {
    const existing = await store.getProjectByConversation(conversationId);
    if (existing) return existing;
  }
  if (typeof store.insertProject !== 'function') return null;
  return store.insertProject({
    company_id: companyId,
    conversation_id: conversationId || null,
    inquiry_id: inquiryId || null,
    demand_id: demandId || null,
    status: 'open',
    title: String(title || '').slice(0, 200),
  });
}

async function recordThreadOutcomes(store, { company, conversationId, message, reply, inquiryId }) {
  if (!store || !company || !company.company_id) return { project: null, events: [] };
  const detected = detectOutcomes(message, reply);
  let project = null;
  try {
    project = await ensureProject(store, {
      companyId: company.company_id,
      conversationId,
      inquiryId,
      title: String(message || '').slice(0, 120),
    });
  } catch (error) {
    console.error('Airsup china project ensure skipped:', error.message);
    return { project: null, events: [] };
  }
  if (!project || !detected.length || typeof store.insertProjectEvent !== 'function') {
    return { project, events: [] };
  }
  const created = [];
  for (const item of detected) {
    try {
      const row = await store.insertProjectEvent({
        project_id: project.project_id,
        company_id: company.company_id,
        event: item.event,
        detail: item.detail,
        evidence: item.evidence,
        promote_to_endpoint: false,
      });
      created.push(row);
      if (item.event !== 'note' && typeof store.updateProject === 'function') {
        const statusMap = {
          quoted: 'quoted',
          accepted: 'accepted',
          delayed: 'delayed',
          shipped: 'shipped',
          paid: 'paid',
          cancelled: 'closed',
        };
        if (statusMap[item.event]) {
          await store.updateProject(project.project_id, { status: statusMap[item.event] });
        }
      }
    } catch (error) {
      console.error('Airsup china project event skipped:', error.message);
    }
  }
  return { project, events: created };
}

async function promoteProjectOutcomes(store, { company, projectId, eventIds, confirm }) {
  if (!store || !company || !company.company_id) return { ok: false, error: 'missing_company' };
  const factsStore = require('./facts-store');
  let events = [];
  if (typeof store.listProjectEvents === 'function') {
    events = await store.listProjectEvents(projectId || null, company.company_id);
  }
  if (Array.isArray(eventIds) && eventIds.length) {
    const allow = new Set(eventIds.map(String));
    events = events.filter((row) => allow.has(String(row.event_id)));
  } else {
    // Only promote terminal-ish outcomes by default when confirm=true
    events = events.filter((row) => ['quoted', 'accepted', 'shipped', 'paid', 'delayed', 'note'].includes(row.event));
  }
  if (!confirm) {
    return {
      ok: true,
      preview: factsFromOutcomes(events, projectId),
      event_count: events.length,
      note: 'Pass confirm=true to write facts and project onto listingText.',
    };
  }
  const rows = factsFromOutcomes(events, projectId).map((row) => ({
    ...row,
    supplier_confirmed: true,
    confidence: Math.max(0.85, Number(row.confidence) || 0.85),
  }));
  const persisted = await factsStore.persistFacts(store, company, rows, {
    source_type: 'project_outcome',
    source_reference: projectId || 'project',
    visibility: 'buyer',
    note: 'confirmed_project_outcome',
  });
  if (typeof store.markProjectEventsPromoted === 'function') {
    await store.markProjectEventsPromoted(events.map((row) => row.event_id));
  }
  const fresh = await store.getById(company.company_id);
  await factsStore.projectBuyerFactsOntoCompany(store, fresh || company);
  return { ok: true, stored: persisted.stored, skipped: persisted.skipped, facts: rows.length };
}

module.exports = {
  OUTCOME_EVENTS,
  detectOutcomes,
  factsFromOutcomes,
  ensureProject,
  recordThreadOutcomes,
  promoteProjectOutcomes,
};
