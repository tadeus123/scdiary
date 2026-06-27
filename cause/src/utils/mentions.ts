import { QuestPoint, QuestGraph } from '../types';
import { newId } from './ids';

export interface MentionQuery {
  start: number;
  query: string;
}

/** Returns active @-mention at cursor, if any. */
export function getMentionAt(text: string, cursor: number): MentionQuery | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  const afterAt = before.slice(at + 1);
  if (afterAt.includes('\n')) return null;
  return { start: at, query: afterAt };
}

export function filterPoints(
  points: QuestPoint[],
  query: string,
  excludeId?: string,
): QuestPoint[] {
  const q = query.trim().toLowerCase();
  return points
    .filter((p) => p.id !== excludeId)
    .filter((p) => !q || p.title.toLowerCase().includes(q))
    .slice(0, 8);
}

/** Find point by exact or prefix title match (case-insensitive). */
export function resolvePointByName(
  points: QuestPoint[],
  name: string,
  excludeId?: string,
): QuestPoint | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const candidates = points.filter((p) => p.id !== excludeId);
  const exact = candidates.find((p) => p.title.toLowerCase() === n);
  if (exact) return exact;
  const starts = candidates.filter((p) => p.title.toLowerCase().startsWith(n));
  if (starts.length === 1) return starts[0];
  const includes = candidates.filter((p) => p.title.toLowerCase().includes(n));
  if (includes.length === 1) return includes[0];
  return null;
}

/** Extract first @mention name from text (word chars and spaces until newline or end). */
export function parseFirstMention(text: string): string | null {
  const m = text.match(/@([^\n@]+)/);
  return m ? m[1].trim() : null;
}

export function insertMention(
  text: string,
  mentionStart: number,
  cursor: number,
  title: string,
): { text: string; cursor: number } {
  const before = text.slice(0, mentionStart);
  const after = text.slice(cursor);
  const mention = `@${title}`;
  const needsSpace = after.length > 0 && !after.startsWith(' ');
  const newText = before + mention + (needsSpace ? ' ' : '') + after;
  const newCursor = before.length + mention.length + (needsSpace ? 1 : 0);
  return { text: newText, cursor: newCursor };
}

/** True when @… before cursor is a full, resolved point name. */
export function isCompleteMention(
  text: string,
  cursor: number,
  points: QuestPoint[],
  excludeId?: string,
): boolean {
  const m = getMentionAt(text, cursor);
  if (!m) return false;
  const slice = text.slice(m.start, cursor);
  return points.some(
    (p) => p.id !== excludeId && slice.toUpperCase() === `@${p.title}`.toUpperCase(),
  );
}

/** If cursor sits inside a resolved @mention, return its span. */
export function findCompleteMentionAt(
  text: string,
  cursor: number,
  points: QuestPoint[],
): { start: number; end: number; pointId: string } | null {
  const titles = [...points].sort((a, b) => b.title.length - a.title.length);
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      let matched = false;
      for (const p of titles) {
        const token = `@${p.title}`;
        const slice = text.slice(i, i + token.length);
        if (slice.toUpperCase() === token.toUpperCase()) {
          const end = i + token.length;
          const next = text[end];
          if (next === undefined || /[\s\n]/.test(next)) {
            if (cursor > i && cursor <= end) {
              return { start: i, end, pointId: p.id };
            }
            i = end;
            matched = true;
            break;
          }
        }
      }
      if (!matched) i++;
    } else {
      i++;
    }
  }
  return null;
}

export type TextSegment = { type: 'text' | 'mention'; value: string };

/** Split text into plain runs and confirmed @point mentions. */
export function splitMentionSegments(text: string, points: QuestPoint[]): TextSegment[] {
  if (!text) return [];
  const titles = [...points].sort((a, b) => b.title.length - a.title.length);
  const segments: TextSegment[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === '@') {
      let matched = false;
      for (const p of titles) {
        const token = `@${p.title}`;
        const slice = text.slice(i, i + token.length);
        if (slice.toUpperCase() === token.toUpperCase()) {
          const next = text[i + token.length];
          if (next === undefined || /[\s\n]/.test(next)) {
            segments.push({ type: 'mention', value: `@${p.title}` });
            i += token.length;
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        const nextAt = text.indexOf('@', i + 1);
        const end = nextAt === -1 ? text.length : nextAt;
        segments.push({ type: 'text', value: text.slice(i, end) });
        i = end;
      }
    } else {
      const nextAt = text.indexOf('@', i);
      const end = nextAt === -1 ? text.length : nextAt;
      segments.push({ type: 'text', value: text.slice(i, end) });
      i = end;
    }
  }

  return segments;
}

/** Point ids referenced by resolved @mentions in text. */
export function extractMentionedPointIds(
  text: string,
  points: QuestPoint[],
  excludeId?: string,
): string[] {
  const ids: string[] = [];
  for (const seg of splitMentionSegments(text, points)) {
    if (seg.type !== 'mention') continue;
    const title = seg.value.slice(1);
    const point = points.find((p) => p.title.toUpperCase() === title.toUpperCase());
    if (point && point.id !== excludeId) ids.push(point.id);
  }
  return ids;
}

/** Add @mentions for incoming edges that are missing from the condition text. */
export function reconcileConditionWithEdges(
  pointId: string,
  condition: string,
  graph: QuestGraph,
): string {
  const mentionedIds = new Set(extractMentionedPointIds(condition, graph.points, pointId));
  const additions: string[] = [];

  for (const edge of graph.edges) {
    if (edge.toId !== pointId || mentionedIds.has(edge.fromId)) continue;
    const from = graph.points.find((p) => p.id === edge.fromId);
    if (!from) continue;
    mentionedIds.add(edge.fromId);
    additions.push(`@${from.title}`);
  }

  if (additions.length === 0) return condition;

  const base = condition.trimEnd();
  return base ? `${base}\n${additions.join('\n')}` : additions.join('\n');
}

/** Sync edges to match a point's condition (@mentions → incoming edges). */
export function applyPointCondition(
  graph: QuestGraph,
  pointId: string,
  condition: string,
): QuestGraph {
  const mentionedIds = extractMentionedPointIds(condition, graph.points, pointId);
  const mentionedSet = new Set(mentionedIds);

  let edges = graph.edges.filter(
    (e) => e.toId !== pointId || mentionedSet.has(e.fromId),
  );

  const existingFrom = new Set(
    edges.filter((e) => e.toId === pointId).map((e) => e.fromId),
  );

  for (const fromId of mentionedIds) {
    if (existingFrom.has(fromId)) {
      edges = edges.map((e) =>
        e.fromId === fromId && e.toId === pointId
          ? { ...e, unlockCondition: condition }
          : e,
      );
    } else {
      edges.push({
        id: newId('e'),
        fromId,
        toId: pointId,
        unlockCondition: condition,
      });
    }
  }

  return {
    ...graph,
    points: graph.points.map((p) => (p.id === pointId ? { ...p, condition } : p)),
    edges,
  };
}

/** Ensure every point's condition lists all of its incoming edge sources. */
export function reconcileGraphConditions(graph: QuestGraph): QuestGraph {
  let next = graph;
  let changed = false;

  for (const point of graph.points) {
    const condition = reconcileConditionWithEdges(point.id, point.condition, next);
    if (condition === point.condition) continue;
    changed = true;
    next = applyPointCondition(next, point.id, condition);
  }

  return changed ? next : graph;
}

/** Replace @oldTitle with @newTitle wherever it appears as a resolved mention token. */
export function replaceMentionTitle(text: string, oldTitle: string, newTitle: string): string {
  if (!text) return text;
  const oldUpper = oldTitle.toUpperCase();
  const newToken = `@${newTitle.toUpperCase()}`;
  if (!oldUpper || oldUpper === newTitle.toUpperCase()) return text;

  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      const rest = text.slice(i + 1);
      if (rest.toUpperCase().startsWith(oldUpper)) {
        const end = i + 1 + oldTitle.length;
        const next = text[end];
        if (next === undefined || /[\s\n]/.test(next)) {
          out += newToken;
          i = end;
          continue;
        }
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/** Remove a resolved @mention line from condition text. */
export function removeMentionFromCondition(condition: string, fromTitle: string): string {
  const token = `@${fromTitle}`.toUpperCase();
  return condition
    .split('\n')
    .filter((line) => line.trim().toUpperCase() !== token)
    .join('\n')
    .trimEnd();
}

/** Rename a point and update every @mention that references it. Edges keep their ids. */
export function applyPointRename(graph: QuestGraph, pointId: string, newTitle: string): QuestGraph {
  const point = graph.points.find((p) => p.id === pointId);
  if (!point) return graph;

  const normalized = newTitle.toUpperCase();
  if (point.title === normalized) return graph;

  const rewrite = (text: string) => replaceMentionTitle(text, point.title, normalized);

  return {
    ...graph,
    points: graph.points.map((p) =>
      p.id === pointId
        ? { ...p, title: normalized }
        : { ...p, condition: rewrite(p.condition) },
    ),
    edges: graph.edges.map((e) => ({
      ...e,
      unlockCondition: rewrite(e.unlockCondition),
    })),
  };
}
