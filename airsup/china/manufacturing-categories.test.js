const assert = require('assert');
const {
  CATEGORIES,
  NICHES,
  PROCESSES,
  PROCESS_GROUPS,
  normalizeNiche,
  guessNiche,
  routeQueryToCategory,
  categorySearchHaystack,
  isBroadFactoryQuery,
} = require('./manufacturing-categories');
const { listingText } = require('./fields');
const { scoreCompany } = require('./find');

const REQUIRED = [
  'cnc',
  'injection',
  'pcba',
  '3d_printing',
  'sintering',
  'led-manufacturing',
  'woodworking',
  'sheet-metal',
  'battery-manufacturing',
  'cable-assemblies',
  'biosignal-electrodes',
  'elastomer-manufacturing',
  'other',
];

const slugs = CATEGORIES.map((row) => row.slug);
assert.deepStrictEqual([...slugs].sort(), [...REQUIRED].sort());
assert.strictEqual(new Set(slugs).size, slugs.length);

REQUIRED.forEach((slug) => {
  assert.ok(NICHES.some((row) => row.id === slug), `NICHES missing ${slug}`);
});
assert.ok(PROCESSES.some((row) => row.id === '5axis'));
assert.ok(PROCESSES.some((row) => row.id === 'sheet'));
assert.ok(PROCESSES.some((row) => row.id === 'sla'));
assert.ok(PROCESSES.some((row) => row.id === 'dry-electrodes'));
assert.ok(PROCESS_GROUPS.some((row) => row.id === 'biosignal-electrodes' && row.items.length > 0));

const otherSlugs = new Set(slugs);
CATEGORIES.forEach((row) => {
  (row.aliases || []).forEach((alias) => {
    const mapped = normalizeNiche(alias);
    assert.strictEqual(mapped, row.slug, `alias "${alias}" should map to ${row.slug}, got ${mapped}`);
    const folded = String(alias || '').trim().toLowerCase().replace(/_/g, '-');
    if (otherSlugs.has(folded) && folded !== row.slug) {
      assert.fail(`alias "${alias}" collides with slug ${folded}`);
    }
  });
});

assert.strictEqual(normalizeNiche('led-manufacturing'), 'led-manufacturing');
assert.strictEqual(normalizeNiche('3d_printing'), '3d_printing');
assert.strictEqual(normalizeNiche('EEG electrodes'), 'biosignal-electrodes');
assert.strictEqual(normalizeNiche('powder metallurgy'), 'sintering');
assert.strictEqual(normalizeNiche('not-a-real-category'), 'cnc');
assert.ok(categorySearchHaystack('biosignal-electrodes').toLowerCase().includes('eeg'));

const routes = [
  ['powder metallurgy manufacturer', 'sintering'],
  ['MIM metal injection molding factory', 'sintering'],
  ['custom LED strip factory', 'led-manufacturing'],
  ['COB LED assembly China', 'led-manufacturing'],
  ['CNC wood furniture factory', 'woodworking'],
  ['cabinetry manufacturer China', 'woodworking'],
  ['sheet metal fabrication China', 'sheet-metal'],
  ['laser cutting bending factory', 'sheet-metal'],
  ['Li-ion cell manufacturer', 'battery-manufacturing'],
  ['custom battery pack factory', 'battery-manufacturing'],
  ['wire harness manufacturer', 'cable-assemblies'],
  ['overmolded cable supplier', 'cable-assemblies'],
  ['dry EEG electrode manufacturer', 'biosignal-electrodes'],
  ['Ag/AgCl electrode manufacturer', 'biosignal-electrodes'],
  ['LSR silicone molding factory', 'elastomer-manufacturing'],
  ['rubber compression molding manufacturer', 'elastomer-manufacturing'],
  ['PA66 injection molding 注塑', 'injection'],
  ['Shenzhen SLA SLS additive 增材 3D printing', '3d_printing'],
  ['FDM MJF resin prototypes', '3d_printing'],
  ['5-axis CNC machining factory', 'cnc'],
  ['PCBA factory Shenzhen', 'pcba'],
];

routes.forEach(([query, slug]) => {
  assert.strictEqual(guessNiche(query), slug, `guessNiche(${JSON.stringify(query)})`);
  assert.strictEqual(routeQueryToCategory(query), slug, `routeQueryToCategory(${JSON.stringify(query)})`);
});

assert.notStrictEqual(guessNiche('Shenzhen SLA SLS additive 增材 3D printing'), 'sintering');
assert.notStrictEqual(guessNiche('MIM metal injection molding factory'), 'injection');
assert.notStrictEqual(guessNiche('PA66 injection molding 注塑'), 'sintering');
assert.notStrictEqual(guessNiche('PA66 injection molding 注塑'), 'elastomer-manufacturing');
assert.notStrictEqual(guessNiche('laser cutting bending factory'), 'cnc');
assert.strictEqual(guessNiche('CNC sheet metal shop'), 'cnc');
assert.notStrictEqual(routeQueryToCategory('welding electrodes for arc welding'), 'biosignal-electrodes');
assert.notStrictEqual(routeQueryToCategory('buy batteries wholesale'), 'battery-manufacturing');
assert.notStrictEqual(routeQueryToCategory('battery reseller lithium packs'), 'battery-manufacturing');

assert.ok(isBroadFactoryQuery('how many factories'));
assert.ok(isBroadFactoryQuery('CNC shops in Dongguan'));
assert.ok(isBroadFactoryQuery('dry EEG electrode manufacturer'));
assert.ok(!isBroadFactoryQuery('Anna Schmidt tango'));

const bio = {
  company_name_en: 'SenseLab Electrodes',
  domain: 'senselab.example',
  city: 'shenzhen',
  niche: 'biosignal-electrodes',
  profile: {},
};
const cnc = {
  company_name_en: 'Acme CNC',
  domain: 'acme-cnc.example',
  city: 'dongguan',
  niche: 'cnc',
  profile: {},
};
const query = 'dry EEG electrode manufacturer';
assert.ok(scoreCompany(bio, query) > scoreCompany(cnc, query));
assert.ok(listingText(bio).toLowerCase().includes('eeg'));
assert.ok(scoreCompany(cnc, 'factories') > 0);

console.log('airsup china manufacturing-categories tests ok');
