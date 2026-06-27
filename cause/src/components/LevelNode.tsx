import { Level } from '../data/levels';
import { LevelStatus } from '../utils/progress';

const LEVEL_EMOJI: Record<string, string> = {
  mission: '🚦',
  survival: '🛋️',
  'systems-map': '🗺️',
  'code-foundation': '💻',
  'electronics-foundation': '⚡',
  'first-revenue': '🪙',
  'network-path': '🤝',
  'builder-path': '🔧',
  'factory-visit': '🏭',
  'cad-competence': '📐',
  'capital-gate': '🦆',
  'humanoid-tour': '🤖',
  'working-limb': '🦾',
  middleware: '🔗',
  'legal-entity': '📜',
  operator: '👤',
  'manufacturing-literacy': '🐦',
  'factory-relationship': '🌙',
  'seed-funding': '💎',
  'standing-frame': '🧍',
  advisor: '👔',
  'home-beta': '🏠',
  locomotion: '⚖️',
  'useful-tasks': '🧺',
  'safety-start': '🛡️',
  'alpha-ten': '🔟',
  'factory-site': '📍',
  'supply-10k': '📦',
  'series-a': '⛰️',
  'pilot-hundred': '⚙️',
  'beta-thousand': '🏘️',
  dfm: '📊',
  'factory-built': '🏗️',
  workforce: '👷',
  'global-certs': '🌍',
  'soul-gate': '❤️',
  'ramp-2740': '🔥',
  'final-boss': '👑',
};

interface LevelNodeProps {
  level: Level;
  status: LevelStatus;
  onClick: () => void;
  branchSide?: 'left' | 'right';
}

export function LevelNode({ level, status, onClick, branchSide }: LevelNodeProps) {
  const emoji = LEVEL_EMOJI[level.id] ?? '⭐';
  const isBoss = level.isBoss;
  const isMilestone = level.isMilestone;

  return (
    <div
      className={[
        'level-node',
        `level-node--${status}`,
        isBoss ? 'level-node--boss' : '',
        isMilestone ? 'level-node--milestone' : '',
        branchSide ? `level-node--${branchSide}` : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className="level-node__btn"
        onClick={onClick}
        disabled={status === 'locked'}
        aria-label={`Level ${level.number}: ${level.title}`}
      >
        <div className="level-node__circle">
          <span className="level-node__emoji" aria-hidden>{emoji}</span>
          <span className="level-node__num">{level.number}</span>
          {status === 'completed' && <span className="level-node__star">★</span>}
          {status === 'locked' && <span className="level-node__lock">🔒</span>}
          {status === 'available' && <span className="level-node__pulse" />}
        </div>

        <div className="level-node__plate">
          <span className="level-node__level-label">Level {level.number}</span>
          <span className="level-node__name">{level.title}</span>
          <span className="level-node__goal">{level.goal}</span>
          {level.branchTag && (
            <span className="level-node__path-tag">{level.branchTag}</span>
          )}
        </div>
      </button>
    </div>
  );
}
