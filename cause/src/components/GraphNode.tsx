import { useEffect, useRef } from 'react';
import { QuestPoint } from '../types';
import { LinkifiedText } from './LinkifiedText';

const PREVIEW_MAX = 28;

interface GraphNodeProps {
  point: QuestPoint;
  mode?: 'view' | 'edit';
  isEditorSelected?: boolean;
  isHub?: boolean;
  unlocksCount?: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onEditSelect?: () => void;
  onResize?: (height: number) => void;
  onDragPointerDown?: (e: React.PointerEvent) => void;
  clickBlockRef?: React.RefObject<boolean>;
}

function stopDragBubble(e: React.PointerEvent) {
  e.stopPropagation();
}

export function GraphNode({
  point,
  mode = 'view',
  isEditorSelected,
  isHub,
  unlocksCount = 0,
  expanded,
  onToggleExpand,
  onEditSelect,
  onResize,
  onDragPointerDown,
  clickBlockRef,
}: GraphNodeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const desc = point.description.trim();
  const hasDesc = desc.length > 0;
  const canExpand = desc.length > PREVIEW_MAX;
  const isSource = unlocksCount > 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !onResize) return;
    const report = () => onResize(el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, desc, onResize]);

  const toggleDesc = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (clickBlockRef?.current) return;
    if (!canExpand) return;
    onToggleExpand();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (clickBlockRef?.current) return;
    if ((e.target as HTMLElement).closest('.graph-node__desc-trigger')) return;
    e.stopPropagation();
    if (mode === 'edit') onEditSelect?.();
  };

  const collapseDesc = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (clickBlockRef?.current) return;
    if (mode === 'edit') {
      onEditSelect?.();
      return;
    }
    onToggleExpand();
  };

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    if (mode !== 'edit') return;
    e.stopPropagation();
    onEditSelect?.();
  };

  if (expanded && canExpand) {
    return (
      <div ref={wrapRef} className="graph-node-wrap graph-node-wrap--expanded">
        <div
          className={[
            'graph-node',
            'graph-node--desc-only',
            mode === 'edit' ? 'graph-node--editable' : '',
            isEditorSelected ? 'graph-node--editor' : '',
          ].filter(Boolean).join(' ')}
        >
          <span
            className="graph-node__title graph-node__title--drag"
            onPointerDown={onDragPointerDown}
            onDoubleClick={handleTitleDoubleClick}
          >
            {point.title}
          </span>
          <button
            type="button"
            className="graph-node__desc-trigger graph-node__desc-trigger--expanded"
            onClick={collapseDesc}
            onPointerDown={stopDragBubble}
            aria-label={`Hide full description for ${point.title}`}
          >
            <div className="graph-node__desc-full">
              <LinkifiedText text={desc} />
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="graph-node-wrap">
      <div
        className={[
          'graph-node',
          isHub ? 'graph-node--hub' : '',
          isSource ? 'graph-node--source' : '',
          isEditorSelected ? 'graph-node--editor' : '',
          mode === 'edit' ? 'graph-node--editable' : '',
        ].filter(Boolean).join(' ')}
        onClick={handleCardClick}
      >
        <span
          className="graph-node__title graph-node__title--drag"
          onPointerDown={onDragPointerDown}
          onDoubleClick={handleTitleDoubleClick}
        >
          {point.title}
        </span>
        {canExpand && (
          <button
            type="button"
            className="graph-node__desc-trigger"
            onClick={toggleDesc}
            onPointerDown={stopDragBubble}
            aria-label={`Show full description for ${point.title}`}
          >
            <span className="graph-node__desc graph-node__desc--preview">{desc}</span>
          </button>
        )}
        {hasDesc && !canExpand && (
          <span className="graph-node__desc graph-node__desc--short">{desc}</span>
        )}
      </div>
    </div>
  );
}
