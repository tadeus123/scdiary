'use strict';

const assert = require('assert');
const gap = require('./gap-demand');
const projects = require('./project-events');

assert.strictEqual(gap.looksLikeFulfillmentNeed('Anna Schmidt'), false);
assert.strictEqual(gap.looksLikeFulfillmentNeed('CNC aluminum 500pcs tolerance 0.01 budget $40'), true);
assert.ok(gap.extractHints('Need PCBA 200 pcs budget $1200').process_hint === 'pcba'
  || gap.extractHints('Need PCBA 200 pcs budget $1200').qty === '200');

const draft = gap.draftOutreachEmail({
  demand: { need_summary: '5-axis titanium bracket qty 30', qty: '30', budget: '800', process_hint: 'cnc' },
  domain: 'example.com',
  claimLink: 'https://www.airsup.co/claim?token=x&demand=y',
  lang: 'en',
});
assert.ok(draft.subject.toLowerCase().includes('customer'));
assert.ok(draft.text.includes('None of the factories'));
assert.ok(draft.text.includes('https://www.airsup.co/claim'));
assert.ok(!draft.text.includes('😀'));

const detected = projects.detectOutcomes(
  'Can you quote lead time?',
  'Unit price USD 12. Quote ready. Lead time 14 days. We can ship next month.'
);
assert.ok(detected.some((row) => row.event === 'quoted'));
assert.ok(detected.some((row) => row.event === 'note'));

const facts = projects.factsFromOutcomes([
  { event: 'shipped', detail: 'shipped', evidence: 'shipped today' },
  { event: 'note', detail: 'lead_time_days:14', evidence: '14 days' },
], 'proj-1');
assert.ok(facts.some((row) => row.fact_key === 'has_shipped_jobs'));
assert.ok(facts.some((row) => row.fact_key === 'observed_lead_time_days' && row.value === '14'));

console.log('gap-demand + project-events tests passed');
