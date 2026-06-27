export interface UnlockPath {
  label?: string;
  criteria: string[];
}

export interface Level {
  id: string;
  number: number;
  zone: string;
  zoneIndex: number;
  title: string;
  goal: string;
  why: string;
  paths: UnlockPath[];
  humor?: string;
  isBoss?: boolean;
  isMilestone?: boolean;
  branchTag?: string;
  nextIds: string[];
  requiresAllPrereqs?: boolean;
}

export const zones = [
  { id: 'I', name: 'World I — Zero', subtitle: 'No money. No factory. One mission.' },
  { id: 'II', name: 'World II — Survive & Learn', subtitle: 'Skills and ramen before robots.' },
  { id: 'III', name: 'World III — Build', subtitle: 'From simulation to physical limb.' },
  { id: 'IV', name: 'World IV — Company', subtitle: 'Legal entity, team, capital, prototype.' },
  { id: 'V', name: 'World V — Product', subtitle: 'Prove it works in real homes.' },
  { id: 'VI', name: 'World VI — Scale', subtitle: 'Factory, supply chain, thousands of units.' },
  { id: 'VII', name: 'World VII — Million', subtitle: 'Design, build, certify, ship at civilization scale.' },
];

export const levels: Level[] = [
  // ── WORLD I: ZERO ──
  {
    id: 'mission',
    number: 1,
    zone: 'I',
    zoneIndex: 0,
    title: 'Mission Lock',
    goal: 'Write and commit to the end goal in one sentence.',
    why: 'A 1M-unit factory is impossible without a fixed north star. Every later decision filters through this.',
    paths: [{
      criteria: [
        'One-sentence mission written: personal humanoid in every home',
        'You can explain it to a stranger in 30 seconds',
      ],
    }],
    humor: 'The lamp is yellow. Not green. Starting.',
    nextIds: ['survival'],
  },
  {
    id: 'survival',
    number: 2,
    zone: 'I',
    zoneIndex: 0,
    title: '90-Day Survival',
    goal: 'Stay alive and learning for 90 days with near-zero capital.',
    why: 'You cannot reach a factory if you run out of food and shelter in month one.',
    paths: [{
      criteria: [
        '90 consecutive days where housing + food cost under €300/month total',
      ],
    }, {
      label: 'Alternate path',
      criteria: [
        'OR: 30+ nights of free/couch housing secured with a repeatable system',
      ],
    }],
    nextIds: ['systems-map'],
  },
  {
    id: 'systems-map',
    number: 3,
    zone: 'I',
    zoneIndex: 0,
    title: 'Systems Map',
    goal: 'Understand and diagram all 5 humanoid subsystems.',
    why: 'A factory assembles systems, not “a robot.” You must know every subsystem before you scale any of them.',
    paths: [{
      criteria: [
        'Diagram covering: structure, actuation, sensing, compute, power',
        'Each subsystem has named components and interfaces to the others',
        'You can explain the diagram to a non-engineer',
      ],
    }],
    nextIds: ['code-foundation'],
  },
  {
    id: 'code-foundation',
    number: 4,
    zone: 'I',
    zoneIndex: 0,
    title: 'Code Foundation',
    goal: 'Control a simulated robot joint from your code.',
    why: 'Every humanoid brain is software. Simulation is free; factory mistakes are expensive.',
    paths: [{
      criteria: [
        'PID or equivalent controller moves a simulated joint to a target angle',
        'Code is version-controlled (git repo exists)',
      ],
    }, {
      label: 'Hardware path',
      criteria: [
        'OR: Firmware on a microcontroller reads a sensor and drives a motor',
      ],
    }],
    nextIds: ['electronics-foundation'],
  },
  {
    id: 'electronics-foundation',
    number: 5,
    zone: 'I',
    zoneIndex: 0,
    title: 'Electronics Foundation',
    goal: 'Move a real motor from your laptop.',
    why: 'The factory line will solder thousands of these connections. You must understand one first.',
    paths: [{
      criteria: [
        'Motor or servo moves on command via your code',
        'You have a motor driver, power source, and microcontroller wired correctly',
      ],
    }],
    nextIds: ['first-revenue'],
  },

  // ── WORLD II: SURVIVE & LEARN ──
  {
    id: 'first-revenue',
    number: 6,
    zone: 'II',
    zoneIndex: 1,
    title: 'First Revenue',
    goal: 'Earn €1,000 (not borrowed, not gifted).',
    why: 'Factories need cash flow long before they need venture capital. Proof you can create value.',
    paths: [{
      criteria: [
        '€1,000+ total earned from work, sales, or contracts',
        'Bank statement or invoice trail as proof',
      ],
    }],
    nextIds: ['network-path', 'builder-path'],
  },
  {
    id: 'network-path',
    number: 7,
    zone: 'II',
    zoneIndex: 1,
    title: 'Industry Contact',
    goal: 'Add one robotics/manufacturing insider to your network.',
    why: 'Supply chains and factory access run on relationships, not Google searches.',
    paths: [{
      criteria: [
        '30+ minute conversation with someone in robotics, hardware, or manufacturing',
        'Their contact saved; concrete follow-up scheduled',
      ],
    }],
    branchTag: 'Path A — Network',
    nextIds: ['factory-visit'],
  },
  {
    id: 'builder-path',
    number: 7,
    zone: 'II',
    zoneIndex: 1,
    title: 'Tool Access',
    goal: 'Get access to makerspace tools (printer, solder station).',
    why: 'You cannot iterate on physical parts without fabrication tools. Buying a factory comes later.',
    paths: [{
      criteria: [
        'Active membership or access to makerspace / hackerspace / university lab',
        '3D printer and soldering station available to you',
      ],
    }],
    branchTag: 'Path B — Builder',
    nextIds: ['cad-competence'],
  },
  {
    id: 'factory-visit',
    number: 8,
    zone: 'II',
    zoneIndex: 1,
    title: 'Factory Visit',
    goal: 'Walk a real production floor and identify the bottleneck.',
    why: 'A 1M-unit factory is just a production floor with bigger numbers. Learn the pattern early.',
    paths: [{
      criteria: [
        'Visited a manufacturing facility (any product)',
        'Can name their bottleneck: what limits daily output',
        'Photos/notes from visit documented',
      ],
    }],
    nextIds: ['capital-gate'],
  },
  {
    id: 'cad-competence',
    number: 8,
    zone: 'II',
    zoneIndex: 1,
    title: 'CAD Competence',
    goal: 'Design one load-bearing robot part in CAD.',
    why: 'Mass production starts with drawings. Every factory part begins as a CAD file.',
    paths: [{
      criteria: [
        'Parametric CAD model of a structural robot component (joint, bracket, frame)',
        'Model includes tolerances and material specification',
      ],
    }],
    nextIds: ['capital-gate'],
  },
  {
    id: 'capital-gate',
    number: 9,
    zone: 'II',
    zoneIndex: 1,
    title: "Dagobert's Vault",
    goal: 'Secure €10,000 of accessible capital.',
    why: 'Motors, travel to Shenzhen, legal fees, and first prototypes each cost real money. €10K is the first boss.',
    paths: [{
      criteria: [
        '€10,000+ in savings or business account',
      ],
    }, {
      label: 'Funding path',
      criteria: [
        'OR: Signed angel/SAFE term sheet (any amount)',
      ],
    }, {
      label: 'Revenue path',
      criteria: [
        'OR: Side business doing €2,000+/month profit for 3 months',
      ],
    }],
    humor: '🦆 "Pfui Deibel! Ten thousand?! In THIS economy?!"',
    isMilestone: true,
    nextIds: ['humanoid-tour'],
  },

  // ── WORLD III: BUILD ──
  {
    id: 'humanoid-tour',
    number: 10,
    zone: 'III',
    zoneIndex: 2,
    title: 'Humanoid Tour',
    goal: 'See existing humanoids in person and document gaps.',
    why: 'You are not inventing humanoids from scratch — you are building a better one for homes. Know the competition.',
    paths: [{
      criteria: [
        'Visited Unitree, UB Tech, Boston Dynamics demo, or equivalent',
        'Written list: 3 things they do well, 3 things you would do differently',
      ],
    }],
    nextIds: ['working-limb'],
  },
  {
    id: 'working-limb',
    number: 11,
    zone: 'III',
    zoneIndex: 2,
    title: 'Working Limb',
    goal: 'Build one 3-DOF limb with closed-loop control.',
    why: 'A humanoid is limbs × body × brain. Master one limb before scaling to 20+ joints.',
    paths: [{
      criteria: [
        'Physical limb with 3+ degrees of freedom',
        'Closed-loop control: encoder feedback, not open-loop guessing',
        'Demo video of controlled movement',
      ],
    }],
    nextIds: ['middleware'],
  },
  {
    id: 'middleware',
    number: 12,
    zone: 'III',
    zoneIndex: 2,
    title: 'Robot Middleware',
    goal: 'Run ROS2 (or equivalent) on real hardware.',
    why: 'A factory-built humanoid has dozens of subsystems talking simultaneously. Middleware is the nervous system.',
    paths: [{
      criteria: [
        'ROS2 node (or equivalent) controlling real hardware',
        'Not just simulation — physical actuator responds to topic/service',
      ],
    }],
    humor: 'catkin build failed. This is the way.',
    nextIds: ['legal-entity'],
  },

  // ── WORLD IV: COMPANY ──
  {
    id: 'legal-entity',
    number: 13,
    zone: 'IV',
    zoneIndex: 3,
    title: 'Legal Entity',
    goal: 'Register a company with a business bank account.',
    why: 'You cannot sign factory contracts, hire staff, or raise investment as a person with a dream.',
    paths: [{
      criteria: [
        'Legal entity registered (GmbH, LLC, Ltd, etc.)',
        'Business bank account open and active',
      ],
    }],
    nextIds: ['operator'],
  },
  {
    id: 'operator',
    number: 14,
    zone: 'IV',
    zoneIndex: 3,
    title: 'The Operator',
    goal: 'Hire or partner with someone who executes without you.',
    why: 'A 1M factory runs 24/7. You cannot be every shift. You need an Ekko.',
    paths: [{
      criteria: [
        'Co-founder or employee who completes tasks independently',
        'They shipped something real while you were offline for 48+ hours',
      ],
    }],
    nextIds: ['manufacturing-literacy'],
  },
  {
    id: 'manufacturing-literacy',
    number: 15,
    zone: 'IV',
    zoneIndex: 3,
    title: 'Manufacturing Literacy',
    goal: 'Ship a batch of 100+ physical units of any product.',
    why: 'Before 1M humanoids, prove you can manage a supply chain, QC, and shipping at small scale.',
    paths: [{
      criteria: [
        '100+ units of any physical product manufactured and shipped',
        'Documented quality check before shipping',
      ],
    }, {
      label: 'Quality gate',
      criteria: [
        'AND: At least one bad batch stopped before shipping (Blackbird standard)',
      ],
    }],
    humor: 'Stopped the bottle filling at 01:11. Worth it.',
    isMilestone: true,
    nextIds: ['factory-relationship'],
  },
  {
    id: 'factory-relationship',
    number: 16,
    zone: 'IV',
    zoneIndex: 3,
    title: 'Factory Relationship',
    goal: 'Get a signed production quote for robot components.',
    why: 'Your future 1M factory starts as a relationship with one factory owner who trusts you.',
    paths: [{
      criteria: [
        'Direct negotiation with factory owner or production manager',
        'Signed quote or PO for robot-related components',
      ],
    }],
    humor: 'Bonus if negotiated after midnight with ABBA playing.',
    nextIds: ['seed-funding'],
  },
  {
    id: 'seed-funding',
    number: 17,
    zone: 'IV',
    zoneIndex: 3,
    title: 'Seed Funding',
    goal: 'Raise €500K or reach €20K monthly revenue.',
    why: 'A standing humanoid prototype costs €200K–€2M. Seed capital bridges from limb to full body.',
    paths: [{
      criteria: [
        'Seed round closed: €500K+ investment or equivalent grant',
      ],
    }, {
      label: 'Bootstrap path',
      criteria: [
        'OR: €20,000+/month revenue for 3 consecutive months',
      ],
    }],
    nextIds: ['standing-frame'],
  },
  {
    id: 'standing-frame',
    number: 18,
    zone: 'IV',
    zoneIndex: 3,
    title: 'Standing Frame',
    goal: 'Full-size humanoid structure stands for 60+ seconds.',
    why: 'The factory will assemble this exact structure thousands of times. Prove the design stands first.',
    paths: [{
      criteria: [
        'Humanoid-sized structure stands unassisted for 60+ seconds',
        'All major body segments present: head, torso, arms, legs (or documented wheeled interim)',
      ],
    }],
    nextIds: ['advisor'],
  },
  {
    id: 'advisor',
    number: 19,
    zone: 'IV',
    zoneIndex: 3,
    title: 'The Advisor',
    goal: 'Get an experienced hardware leader on your board.',
    why: 'Building to 1M units requires pattern recognition from someone who has scaled hardware before.',
    paths: [{
      criteria: [
        'Board member or formal advisor with hardware/robotics company experience',
        'They made 2+ introductions that advanced the company',
      ],
    }],
    nextIds: ['home-beta'],
  },

  // ── WORLD V: PRODUCT ──
  {
    id: 'home-beta',
    number: 20,
    zone: 'V',
    zoneIndex: 4,
    title: 'Home Beta',
    goal: 'Prototype survives 7 days in a real home.',
    why: 'Homes have stairs, pets, bad WiFi, and cereal bowls on the floor. Labs lie.',
    paths: [{
      criteria: [
        'Prototype deployed in a real home for 7 consecutive days',
        'Failure log with timestamps and root causes documented',
      ],
    }],
    nextIds: ['locomotion'],
  },
  {
    id: 'locomotion',
    number: 21,
    zone: 'V',
    zoneIndex: 4,
    title: 'Locomotion',
    goal: 'Walk 3 steps OR ship wheeled MVP with bipedal roadmap.',
    why: 'A home humanoid must move through doorways, kitchens, and hallways. Movement is non-negotiable.',
    paths: [{
      criteria: [
        'Bipedal: 3 consecutive steps without human support',
      ],
    }, {
      label: 'Wheeled interim',
      criteria: [
        'OR: Wheeled prototype in homes + published bipedal engineering roadmap',
      ],
    }],
    nextIds: ['useful-tasks'],
  },
  {
    id: 'useful-tasks',
    number: 22,
    zone: 'V',
    zoneIndex: 4,
    title: 'Useful Tasks',
    goal: 'Perform 3 home tasks at 80%+ success rate.',
    why: 'Nobody buys a humanoid to dance. Groceries, dishes, laundry — prove utility.',
    paths: [{
      criteria: [
        '3 distinct home tasks demonstrated (e.g. carry groceries, load dishwasher, fold laundry)',
        'Each task succeeds 80%+ of attempts across 10+ trials',
      ],
    }],
    nextIds: ['safety-start'],
  },
  {
    id: 'safety-start',
    number: 23,
    zone: 'V',
    zoneIndex: 4,
    title: 'Safety Certification Start',
    goal: 'Hire safety engineer and complete risk analysis.',
    why: 'You cannot ship 1M units into homes without CE/FCC/UL. Start before you scale, not after.',
    paths: [{
      criteria: [
        'Safety engineer hired or contracted',
        'Risk analysis document completed per IEC 61508 / ISO 13482 framework',
      ],
    }],
    nextIds: ['alpha-ten'],
  },
  {
    id: 'alpha-ten',
    number: 24,
    zone: 'V',
    zoneIndex: 4,
    title: 'Alpha × 10',
    goal: 'Deploy 10 units in paying beta homes.',
    why: 'Ten homes reveal the failure modes that one home hides. This is the last R&D phase.',
    paths: [{
      criteria: [
        '10 units deployed in paying customer homes',
        'Structured feedback collected weekly from each home',
      ],
    }],
    isMilestone: true,
    nextIds: ['factory-site'],
  },

  // ── WORLD VI: SCALE ──
  {
    id: 'factory-site',
    number: 25,
    zone: 'VI',
    zoneIndex: 5,
    title: 'Factory Site',
    goal: 'Secure factory space or contract manufacturer.',
    why: '1M units/year ≈ 2,740/day. That requires dedicated floor space and production lines.',
    paths: [{
      criteria: [
        'Factory lease signed OR contract manufacturing agreement in place',
        'Floor plan with space for at least 2 assembly lines',
      ],
    }],
    nextIds: ['supply-10k'],
  },
  {
    id: 'supply-10k',
    number: 26,
    zone: 'VI',
    zoneIndex: 5,
    title: 'Supply Chain × 10K',
    goal: 'Lock 6-month supply for 10,000 units.',
    why: 'At 1M scale, a missing actuator supplier stops the entire line. Build supply redundancy now.',
    paths: [{
      criteria: [
        'Purchase orders or contracts covering 6 months of production at 10K unit rate',
        '2+ backup suppliers identified for each critical component',
      ],
    }],
    nextIds: ['series-a'],
  },
  {
    id: 'series-a',
    number: 27,
    zone: 'VI',
    zoneIndex: 5,
    title: 'Series A',
    goal: 'Raise €10M+ or become profitable.',
    why: 'A factory producing thousands/day requires tens of millions in equipment, inventory, and payroll.',
    paths: [{
      criteria: [
        'Series A closed: €10M+ or equivalent strategic investment',
      ],
    }, {
      label: 'Profitability path',
      criteria: [
        'OR: Company profitable for 2 consecutive quarters without new funding',
      ],
    }],
    nextIds: ['pilot-hundred'],
  },
  {
    id: 'pilot-hundred',
    number: 28,
    zone: 'VI',
    zoneIndex: 5,
    title: 'Pilot × 100',
    goal: 'Produce 100 humanoids on a repeatable line in 12 months.',
    why: 'Hand-building 100 proves demand. A repeatable line proves you can build a factory.',
    paths: [{
      criteria: [
        '100 humanoids produced within 12 months',
        'Same assembly process used for unit 1 and unit 100 (documented SOP)',
      ],
    }],
    nextIds: ['beta-thousand'],
  },
  {
    id: 'beta-thousand',
    number: 29,
    zone: 'VI',
    zoneIndex: 5,
    title: 'Beta × 1,000',
    goal: '1,000 paying customers with deployed units.',
    why: '1,000 homes is the proof that the product works at small civilization scale before 1M.',
    paths: [{
      criteria: [
        '1,000 paying customers with active deployed humanoids',
        'NPS score ≥ 30 or 70%+ would recommend',
      ],
    }],
    isMilestone: true,
    nextIds: ['dfm'],
  },

  // ── WORLD VII: MILLION ──
  {
    id: 'dfm',
    number: 30,
    zone: 'VII',
    zoneIndex: 6,
    title: 'Design for Million',
    goal: 'Hit target unit cost at 1M/year volume.',
    why: 'A humanoid nobody can afford will never reach 1M homes. DfM is the economics boss fight.',
    paths: [{
      criteria: [
        'BOM cost at 1M/year volume below your target price ÷ 3',
        'Part count reduced vs. prototype; automated assembly steps documented',
      ],
    }],
    nextIds: ['factory-built'],
  },
  {
    id: 'factory-built',
    number: 31,
    zone: 'VII',
    zoneIndex: 6,
    title: 'Factory Built',
    goal: 'First full production line operational.',
    why: 'This is the physical machine that will output 1M humanoids. It must run before it can scale.',
    paths: [{
      criteria: [
        'Assembly line operational: inbound parts → assembled humanoid → tested → boxed',
        'Line produces at least 10 units/day sustained for 5 days',
      ],
    }],
    nextIds: ['workforce'],
  },
  {
    id: 'workforce',
    number: 32,
    zone: 'VII',
    zoneIndex: 6,
    title: 'Workforce',
    goal: 'Staff team for 1M/year production plan.',
    why: '2,740 units/day needs hundreds of operators, engineers, and QA — not a garage team.',
    paths: [{
      criteria: [
        'Org chart sized for 1M/year: production, QA, supply chain, support',
        'All critical roles filled or contracted',
      ],
    }],
    nextIds: ['global-certs'],
  },
  {
    id: 'global-certs',
    number: 33,
    zone: 'VII',
    zoneIndex: 6,
    title: 'Global Certification',
    goal: 'Legally sellable in EU, US, and Asia.',
    why: '1M homes span continents. CE + FCC + CCC (or equivalents) are the keys to those doors.',
    paths: [{
      criteria: [
        'CE marking obtained (EU)',
        'FCC certification obtained (US)',
        'CCC or equivalent obtained (China/Asia)',
      ],
    }],
    nextIds: ['soul-gate'],
  },
  {
    id: 'soul-gate',
    number: 34,
    zone: 'VII',
    zoneIndex: 6,
    title: 'Soul Gate',
    goal: '90%+ of test families want to keep the humanoid.',
    why: 'The danger is not evil robots — it is boring ones. A million boring robots is a million failures.',
    paths: [{
      criteria: [
        '50+ family test: 90%+ say they would keep it permanently',
        'Design review passed: warmth and presence, not just efficiency',
      ],
    }],
    humor: 'Not evil robots. Not boring robots. Furniture with soul.',
    nextIds: ['ramp-2740'],
  },
  {
    id: 'ramp-2740',
    number: 35,
    zone: 'VII',
    zoneIndex: 6,
    title: 'Ramp to 2,740/Day',
    goal: 'Sustain 2,740 units/day for 30 days (= 1M/year rate).',
    why: '1,000,000 ÷ 365 = 2,740 per day. Hit this rate sustained and the factory is real.',
    paths: [{
      criteria: [
        '2,740 units produced per day sustained for 30 consecutive days',
        'Defect rate below 2%; supply chain keeping pace',
      ],
    }],
    isMilestone: true,
    nextIds: ['final-boss'],
  },
  {
    id: 'final-boss',
    number: 36,
    zone: 'VII',
    zoneIndex: 6,
    title: 'The Million Homes Factory',
    goal: 'Active factory outputting 1,000,000 personal humanoids per year.',
    why: 'The end. A humanoid in every home — personal, for individuals, with soul. The lamp is green.',
    paths: [{
      criteria: [
        'Factory producing at 1,000,000 humanoids/year rate (verified output data)',
        'Units shipping to individual homes globally',
        'Unit is personal/home humanoid — not industrial, not military',
      ],
    }],
    humor: '🏆 BOSS DEFEATED. The couch era is over. The factory era begins.',
    isBoss: true,
    nextIds: [],
  },
];

export function getLevelById(id: string): Level | undefined {
  return levels.find((l) => l.id === id);
}

export function getPrerequisiteIds(levelId: string): string[] {
  return levels.filter((l) => l.nextIds.includes(levelId)).map((l) => l.id);
}

export function getZoneById(id: string) {
  return zones.find((z) => z.id === id);
}
