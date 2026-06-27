import { QuestGraph, PointPosition } from '../types';

const NODE_W = 172;
const NODE_H = 68;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function computeDegrees(graph: QuestGraph): Map<string, number> {
  const deg = new Map<string, number>();
  for (const p of graph.points) deg.set(p.id, 0);
  for (const e of graph.edges) {
    deg.set(e.fromId, (deg.get(e.fromId) ?? 0) + 1);
    deg.set(e.toId, (deg.get(e.toId) ?? 0) + 1);
  }
  return deg;
}

function neighborsOf(graph: QuestGraph, id: string): Set<string> {
  const n = new Set<string>();
  for (const e of graph.edges) {
    if (e.fromId === id) n.add(e.toId);
    if (e.toId === id) n.add(e.fromId);
  }
  return n;
}

/** Hubs = well-connected nodes that anchor orbital clusters (bookshelf-style). */
function identifyHubs(graph: QuestGraph, degrees: Map<string, number>): Set<string> {
  const hubs = new Set<string>();
  if (graph.points.length === 0) return hubs;

  const maxDeg = Math.max(...degrees.values(), 0);
  if (maxDeg <= 1) {
    hubs.add(graph.points[0].id);
    return hubs;
  }

  for (const p of graph.points) {
    if ((degrees.get(p.id) ?? 0) >= 2) hubs.add(p.id);
  }

  if (hubs.size === 0) {
    let best = graph.points[0].id;
    for (const p of graph.points) {
      if ((degrees.get(p.id) ?? 0) > (degrees.get(best) ?? 0)) best = p.id;
    }
    hubs.add(best);
  }

  return hubs;
}

function spreadHubCenters(
  hubIds: string[],
  width: number,
  height: number,
  padX: number,
  padY: number,
): Map<string, { x: number; y: number }> {
  const centers = new Map<string, { x: number; y: number }>();
  const cx = width / 2;
  const cy = height / 2;
  const sorted = [...hubIds].sort((a, b) => hashId(a) - hashId(b));

  if (sorted.length === 1) {
    centers.set(sorted[0], { x: cx, y: cy });
    return centers;
  }

  const spreadX = (width - padX * 2) * 0.38;
  const spreadY = (height - padY * 2) * 0.38;

  sorted.forEach((id, i) => {
    const golden = i * 2.399963229728653;
    const wobble = ((hashId(id) % 100) / 100) * 0.22;
    const r = 0.55 + wobble;
    centers.set(id, {
      x: cx + Math.cos(golden) * spreadX * r,
      y: cy + Math.sin(golden) * spreadY * r,
    });
  });

  return centers;
}

type OrbitSlot = { hubId: string; angle: number; radius: number };

function assignOrbits(
  graph: QuestGraph,
  hubs: Set<string>,
  degrees: Map<string, number>,
): Map<string, OrbitSlot> {
  const orbits = new Map<string, OrbitSlot>();
  const byHub = new Map<string, string[]>();

  const defaultHub = [...hubs].sort(
    (a, b) => (degrees.get(b) ?? 0) - (degrees.get(a) ?? 0),
  )[0];

  for (const p of graph.points) {
    if (hubs.has(p.id)) continue;

    const neighbors = neighborsOf(graph, p.id);
    let hubId = defaultHub;
    let bestDeg = -1;

    for (const nId of neighbors) {
      if (hubs.has(nId) && (degrees.get(nId) ?? 0) > bestDeg) {
        bestDeg = degrees.get(nId) ?? 0;
        hubId = nId;
      }
    }

    if (!byHub.has(hubId)) byHub.set(hubId, []);
    byHub.get(hubId)!.push(p.id);
  }

  for (const [hubId, satellites] of byHub) {
    satellites.sort((a, b) => hashId(a) - hashId(b));
    const count = satellites.length;
    const baseRadius = 118 + Math.min(count * 14, 95);
    const hubJitter = (hashId(hubId) % 360) * (Math.PI / 180) * 0.12;

    satellites.forEach((satId, i) => {
      const angle = hubJitter + (i / Math.max(count, 1)) * Math.PI * 2;
      const radius = baseRadius + (hashId(satId) % 36);
      orbits.set(satId, { hubId, angle, radius });
    });
  }

  return orbits;
}

export function estimateCanvasHeight(graph: QuestGraph, width: number): number {
  const n = graph.points.length;
  const degrees = computeDegrees(graph);
  const hubs = identifyHubs(graph, degrees);
  return Math.max(
    460,
    Math.min(1200, 260 + n * 72 + hubs.size * 100 + width * 0.12),
  );
}

/** Bookshelf-style layout: hubs float as anchors, satellites orbit around them. */
export function computeLayout(
  graph: QuestGraph,
  width: number,
  height: number,
): PointPosition[] {
  const { points, edges } = graph;
  if (points.length === 0) return [];

  const degrees = computeDegrees(graph);
  const hubs = identifyHubs(graph, degrees);
  const padX = NODE_W * 0.55 + 28;
  const padY = NODE_H * 0.55 + 36;

  const hubCenters = spreadHubCenters([...hubs], width, height, padX, padY);
  const orbits = assignOrbits(graph, hubs, degrees);

  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();

  for (const p of points) {
    const h = hashId(p.id);
    if (hubs.has(p.id)) {
      const c = hubCenters.get(p.id) ?? { x: width / 2, y: height / 2 };
      pos.set(p.id, {
        x: c.x + ((h % 31) - 15),
        y: c.y + ((h % 23) - 11),
        vx: 0,
        vy: 0,
      });
      continue;
    }

    const orbit = orbits.get(p.id);
    if (orbit) {
      const hub = pos.get(orbit.hubId) ?? hubCenters.get(orbit.hubId);
      const hx = hub?.x ?? width / 2;
      const hy = hub?.y ?? height / 2;
      pos.set(p.id, {
        x: hx + Math.cos(orbit.angle) * orbit.radius,
        y: hy + Math.sin(orbit.angle) * orbit.radius,
        vx: 0,
        vy: 0,
      });
    } else {
      pos.set(p.id, {
        x: padX + ((h % 997) / 997) * (width - padX * 2),
        y: padY + ((h % 613) / 613) * (height - padY * 2),
        vx: 0,
        vy: 0,
      });
    }
  }

  // Ensure hub positions exist before satellite init references them
  for (const hubId of hubs) {
    if (!pos.has(hubId)) {
      const c = hubCenters.get(hubId) ?? { x: width / 2, y: height / 2 };
      pos.set(hubId, { x: c.x, y: c.y, vx: 0, vy: 0 });
    }
  }

  // Re-init satellites now that hubs are placed
  for (const p of points) {
    if (hubs.has(p.id)) continue;
    const orbit = orbits.get(p.id);
    if (!orbit) continue;
    const hub = pos.get(orbit.hubId)!;
    const node = pos.get(p.id)!;
    node.x = hub.x + Math.cos(orbit.angle) * orbit.radius;
    node.y = hub.y + Math.sin(orbit.angle) * orbit.radius;
  }

  const iterations = 220;
  const minDist = 108;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;
    const t = alpha * alpha;

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = pos.get(points[i].id)!;
        const b = pos.get(points[j].id)!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const repulse = (minDist * minDist / dist) * 0.42 * t;
        dx = (dx / dist) * repulse;
        dy = (dy / dist) * repulse;
        a.vx -= dx;
        a.vy -= dy;
        b.vx += dx;
        b.vy += dy;
      }
    }

    for (const e of edges) {
      const a = pos.get(e.fromId);
      const b = pos.get(e.toId);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const aHub = hubs.has(e.fromId);
      const bHub = hubs.has(e.toId);
      const ideal = aHub && bHub ? 200 : aHub || bHub ? 128 : 148;
      const force = (dist - ideal) * 0.042 * t;
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
      b.vx -= (dx / dist) * force;
      b.vy -= (dy / dist) * force;
    }

    for (const hubId of hubs) {
      const target = hubCenters.get(hubId);
      const node = pos.get(hubId);
      if (!target || !node) continue;
      node.vx += (target.x - node.x) * 0.052 * t;
      node.vy += (target.y - node.y) * 0.052 * t;
    }

    for (const [satId, orbit] of orbits) {
      const hub = pos.get(orbit.hubId);
      const node = pos.get(satId);
      if (!hub || !node) continue;
      const tx = hub.x + Math.cos(orbit.angle) * orbit.radius;
      const ty = hub.y + Math.sin(orbit.angle) * orbit.radius;
      node.vx += (tx - node.x) * 0.055 * t;
      node.vy += (ty - node.y) * 0.055 * t;
    }

    const cx = width / 2;
    const cy = height / 2;
    for (const p of points) {
      const node = pos.get(p.id)!;
      node.vx += (cx - node.x) * 0.0018 * t;
      node.vy += (cy - node.y) * 0.0018 * t;
    }

    for (const p of points) {
      const node = pos.get(p.id)!;
      node.x += node.vx * 0.32;
      node.y += node.vy * 0.32;
      node.vx *= 0.5;
      node.vy *= 0.5;
      node.x = Math.max(padX, Math.min(width - padX, node.x));
      node.y = Math.max(padY, Math.min(height - padY, node.y));
    }
  }

  return points.map((p) => {
    const n = pos.get(p.id)!;
    return { id: p.id, x: n.x, y: n.y };
  });
}

/** Hub ids for styling (degree ≥ 2 or primary anchor). */
export function getHubIds(graph: QuestGraph): Set<string> {
  return identifyHubs(graph, computeDegrees(graph));
}

/** Anchor on node edge toward target — straight bookshelf-style lines. */
export function getAnchors(
  x1: number, y1: number, x2: number, y2: number,
): { sx: number; sy: number; ex: number; ey: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const hw = NODE_W / 2 + 2;
  const hh = NODE_H / 2 + 2;

  const tx = Math.abs(ux) > 0.001 ? hw / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 0.001 ? hh / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty);

  return {
    sx: x1 + ux * t,
    sy: y1 + uy * t,
    ex: x2 - ux * t,
    ey: y2 - uy * t,
  };
}

export { NODE_W, NODE_H };
