export type MapRowType = 'single' | 'branch' | 'merge';

export interface MapRow {
  type: MapRowType;
  levelIds: string[];
  zoneId?: string;
  branchLabel?: string;
  mergeLabel?: string;
}

/** Visual layout order for the game map (top → bottom). */
export const mapLayout: MapRow[] = [
  { type: 'single', levelIds: ['mission'], zoneId: 'I' },
  { type: 'single', levelIds: ['survival'] },
  { type: 'single', levelIds: ['systems-map'] },
  { type: 'single', levelIds: ['code-foundation'] },
  { type: 'single', levelIds: ['electronics-foundation'] },
  { type: 'single', levelIds: ['first-revenue'], zoneId: 'II' },
  {
    type: 'branch',
    levelIds: ['network-path', 'builder-path'],
    branchLabel: 'Fork: Path A (network) or Path B (tools) — either unlocks the merge',
  },
  {
    type: 'branch',
    levelIds: ['factory-visit', 'cad-competence'],
    branchLabel: 'Path A → factory floor  ·  Path B → CAD mastery',
  },
  {
    type: 'merge',
    levelIds: ['capital-gate'],
    mergeLabel: 'Paths merge — finish either branch above',
  },
  { type: 'single', levelIds: ['humanoid-tour'], zoneId: 'III' },
  { type: 'single', levelIds: ['working-limb'] },
  { type: 'single', levelIds: ['middleware'] },
  { type: 'single', levelIds: ['legal-entity'], zoneId: 'IV' },
  { type: 'single', levelIds: ['operator'] },
  { type: 'single', levelIds: ['manufacturing-literacy'] },
  { type: 'single', levelIds: ['factory-relationship'] },
  { type: 'single', levelIds: ['seed-funding'] },
  { type: 'single', levelIds: ['standing-frame'] },
  { type: 'single', levelIds: ['advisor'] },
  { type: 'single', levelIds: ['home-beta'], zoneId: 'V' },
  { type: 'single', levelIds: ['locomotion'] },
  { type: 'single', levelIds: ['useful-tasks'] },
  { type: 'single', levelIds: ['safety-start'] },
  { type: 'single', levelIds: ['alpha-ten'] },
  { type: 'single', levelIds: ['factory-site'], zoneId: 'VI' },
  { type: 'single', levelIds: ['supply-10k'] },
  { type: 'single', levelIds: ['series-a'] },
  { type: 'single', levelIds: ['pilot-hundred'] },
  { type: 'single', levelIds: ['beta-thousand'] },
  { type: 'single', levelIds: ['dfm'], zoneId: 'VII' },
  { type: 'single', levelIds: ['factory-built'] },
  { type: 'single', levelIds: ['workforce'] },
  { type: 'single', levelIds: ['global-certs'] },
  { type: 'single', levelIds: ['soul-gate'] },
  { type: 'single', levelIds: ['ramp-2740'] },
  { type: 'single', levelIds: ['final-boss'] },
];
