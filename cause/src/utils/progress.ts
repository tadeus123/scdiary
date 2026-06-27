import { Level } from '../data/levels';

export type LevelStatus = 'locked' | 'available' | 'completed';

export interface ProgressState {
  completed: string[];
}

const STORAGE_KEY = 'humanoid-quest-progress-v2';

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { completed: [] };
}

export function saveProgress(state: ProgressState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getLevelStatus(
  levelId: string,
  completed: string[],
  allLevels: Level[]
): LevelStatus {
  if (completed.includes(levelId)) return 'completed';

  const level = allLevels.find((l) => l.id === levelId);
  if (!level) return 'locked';

  if (levelId === 'mission') return 'available';

  const prerequisites = allLevels.filter((l) => l.nextIds.includes(levelId));
  if (prerequisites.length === 0) return 'locked';

  const anyPrereqComplete = prerequisites.some((p) => completed.includes(p.id));
  return anyPrereqComplete ? 'available' : 'locked';
}

export function getCompletionPercent(completed: string[], total: number): number {
  return Math.round((completed.length / total) * 100);
}

export function resetProgress(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getNextLevels(levelId: string, allLevels: Level[]): Level[] {
  const level = allLevels.find((l) => l.id === levelId);
  if (!level) return [];
  return level.nextIds.map((id) => allLevels.find((l) => l.id === id)!).filter(Boolean);
}
