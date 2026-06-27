import { useMemo } from 'react';
import { levels, zones, Level } from '../data/levels';
import { mapLayout } from '../data/mapLayout';
import { LevelStatus } from '../utils/progress';
import { LevelNode } from './LevelNode';

interface LevelMapProps {
  getStatus: (id: string) => LevelStatus;
  onSelectLevel: (level: Level) => void;
}

function isPathActive(status: LevelStatus): boolean {
  return status === 'completed' || status === 'available';
}

export function LevelMap({ getStatus, onSelectLevel }: LevelMapProps) {
  const levelMap = useMemo(() => new Map(levels.map((l) => [l.id, l])), []);

  return (
    <div className="game-map">
      <div className="game-map__trail" aria-hidden />

      {mapLayout.map((row, rowIndex) => {
        const zone = row.zoneId ? zones.find((z) => z.id === row.zoneId) : undefined;
        const isBranch = row.type === 'branch';
        const isMerge = row.type === 'merge';
        const prevRow = rowIndex > 0 ? mapLayout[rowIndex - 1] : null;
        const prevActive = prevRow
          ? prevRow.levelIds.some((id) => isPathActive(getStatus(id)))
          : true;

        return (
          <div
            key={rowIndex}
            className={`game-map__row game-map__row--${row.type}`}
          >
            {zone && (
              <div className="world-banner">
                <div className="world-banner__icon">{zone.id}</div>
                <div className="world-banner__text">
                  <h2 className="world-banner__name">{zone.name}</h2>
                  <p className="world-banner__sub">{zone.subtitle}</p>
                </div>
              </div>
            )}

            {row.branchLabel && (
              <p className="game-map__fork-label">{row.branchLabel}</p>
            )}
            {row.mergeLabel && (
              <p className="game-map__merge-label">{row.mergeLabel}</p>
            )}

            <div className={`game-map__nodes ${isBranch ? 'game-map__nodes--branch' : ''}`}>
              {row.levelIds.map((id, i) => {
                const level = levelMap.get(id);
                if (!level) return null;
                const status = getStatus(id);
                return (
                  <LevelNode
                    key={id}
                    level={level}
                    status={status}
                    onClick={() => onSelectLevel(level)}
                    branchSide={isBranch ? (i === 0 ? 'left' : 'right') : undefined}
                  />
                );
              })}
            </div>

            {rowIndex < mapLayout.length - 1 && (
              <div className={`game-map__path-segment ${prevActive ? 'game-map__path-segment--active' : ''}`}>
                {isBranch && <div className="game-map__fork-lines" aria-hidden />}
                {isMerge && <div className="game-map__merge-lines" aria-hidden />}
                <div className="game-map__path-dots">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
