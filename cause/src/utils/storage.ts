import { QuestGraph } from '../types';
import { reconcileGraphConditions, applyPointCondition } from './mentions';

const STORAGE_KEY = 'quest-builder-graph';

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

export function loadGraph(): QuestGraph {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeGraph(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return createDefaultGraph();
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

export function saveGraph(graph: QuestGraph): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
}

export { newId } from './ids';
