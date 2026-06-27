import { QuestGraph } from '../types';
import { reconcileGraphConditions, applyPointCondition } from './mentions';

const STORAGE_KEY = 'quest-builder-graph';
const API_URL = '/api/cause/graph';

export function createDefaultGraph(): QuestGraph {
  const graph: QuestGraph = {
    points: [
      { id: 'a', title: 'POINT A', description: '', condition: '' },
      { id: 'b', title: 'POINT B', description: '', condition: '@POINT A' },
    ],
    edges: [],
  };
  return applyPointCondition(graph, 'b', '@POINT A');
}

function normalizeGraph(graph: QuestGraph): QuestGraph {
  const base: QuestGraph = {
    ...graph,
    points: graph.points.map((p) => ({
      ...p,
      title: (p.title ?? '').toUpperCase(),
      description: p.description ?? '',
      condition: p.condition ?? '',
    })),
    positions: graph.positions ?? undefined,
    edges: graph.edges ?? [],
  };
  let next = reconcileGraphConditions(base);
  for (const point of next.points) {
    next = applyPointCondition(next, point.id, point.condition);
  }
  return next;
}

function isDefaultGraph(graph: QuestGraph): boolean {
  if (graph.points.length !== 2 || graph.edges.length > 0) return false;
  const titles = graph.points.map((p) => p.title).sort();
  return titles[0] === 'POINT A' && titles[1] === 'POINT B';
}

function readLocalGraph(): QuestGraph | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeGraph(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function fetchGraph(): Promise<QuestGraph> {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`Failed to load graph (${response.status})`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.graph) {
    throw new Error(payload.error || 'Failed to load graph');
  }

  let graph = normalizeGraph(payload.graph);

  const localGraph = readLocalGraph();
  if (localGraph && isDefaultGraph(graph) && !isDefaultGraph(localGraph)) {
    await persistGraph(localGraph);
    localStorage.removeItem(STORAGE_KEY);
    graph = localGraph;
  }

  return graph;
}

export async function persistGraph(graph: QuestGraph): Promise<void> {
  const response = await fetch(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph: normalizeGraph(graph) }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Failed to save graph (${response.status})`);
  }
}

/** @deprecated Use fetchGraph() — kept for typing during initial render only */
export function loadGraph(): QuestGraph {
  return createDefaultGraph();
}

export { newId } from './ids';
