export interface QuestPoint {
  id: string;
  title: string;
  /** Short description shown under the title on the map. */
  description: string;
  /** What must be true for this point itself to count as reached. */
  condition: string;
}

export interface UnlockEdge {
  id: string;
  fromId: string;
  toId: string;
  /** What must be true at `from` to unlock `to`. */
  unlockCondition: string;
}

export interface QuestGraph {
  points: QuestPoint[];
  edges: UnlockEdge[];
  /** User-placed node positions (overrides auto-layout). */
  positions?: Record<string, { x: number; y: number }>;
}

export interface PointPosition {
  id: string;
  x: number;
  y: number;
}
