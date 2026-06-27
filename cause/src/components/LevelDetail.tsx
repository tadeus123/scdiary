import { Level, getZoneById } from '../data/levels';
import { getNextLevels } from '../utils/progress';
import { levels } from '../data/levels';

interface LevelDetailProps {
  level: Level;
  status: 'locked' | 'available' | 'completed';
  onComplete: () => void;
  onClose: () => void;
}

export function LevelDetail({ level, status, onComplete, onClose }: LevelDetailProps) {
  const zone = getZoneById(level.zone);
  const nextLevels = getNextLevels(level.id, levels);

  return (
    <div className="level-detail-overlay" onClick={onClose}>
      <div className="level-detail" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="level-detail__close" onClick={onClose} aria-label="Close">×</button>

        <div className="level-detail__badge">
          {level.isBoss ? '👑 BOSS LEVEL' : `LEVEL ${level.number}`}
          {zone && <span className="level-detail__world">{zone.name}</span>}
        </div>

        <h2 className="level-detail__title">{level.title}</h2>

        <div className="level-detail__goal-box">
          <span className="level-detail__label">What to achieve</span>
          <p className="level-detail__goal">{level.goal}</p>
        </div>

        <div className="level-detail__why-box">
          <span className="level-detail__label">Why this matters</span>
          <p className="level-detail__why">{level.why}</p>
        </div>

        <div className="level-detail__criteria">
          <span className="level-detail__label">To freischalten the next level</span>
          {level.paths.map((path, pi) => (
            <div key={pi} className={`level-detail__path ${pi > 0 ? 'level-detail__path--alt' : ''}`}>
              {path.label && <span className="level-detail__path-label">{path.label}</span>}
              <ul>
                {path.criteria.map((c, ci) => (
                  <li key={ci}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {level.humor && (
          <p className="level-detail__humor">{level.humor}</p>
        )}

        {nextLevels.length > 0 && (
          <div className="level-detail__next">
            <span className="level-detail__label">Unlocks</span>
            <div className="level-detail__next-list">
              {nextLevels.map((n) => (
                <span key={n.id} className="level-detail__next-chip">
                  L{n.number} {n.title}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="level-detail__actions">
          {status === 'available' && (
            <button type="button" className="level-detail__complete-btn" onClick={onComplete}>
              Level Complete ✓
            </button>
          )}
          {status === 'completed' && (
            <span className="level-detail__done">✓ Cleared — next level unlocked</span>
          )}
          {status === 'locked' && (
            <span className="level-detail__locked-msg">🔒 Complete the previous level first</span>
          )}
        </div>
      </div>
    </div>
  );
}
