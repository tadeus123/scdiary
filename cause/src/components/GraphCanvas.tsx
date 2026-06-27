import { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { QuestGraph } from '../types';
import {
  computeLayout,
  estimateCanvasHeight,
  getAnchors,
  getHubIds,
  NODE_W,
  NODE_H,
} from '../utils/layout';
import { GraphNode } from './GraphNode';

const EDGE_LINE_COLOR = '#9A7B5A';
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const ZOOM_FACTOR = 0.0012;

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface GraphCanvasProps {
  graph: QuestGraph;
  mode?: 'view' | 'edit';
  editorPointId?: string | null;
  selectedEdgeId?: string | null;
  onEditPoint?: (id: string) => void;
  onSelectEdge?: (id: string) => void;
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
}

function straightPath(sx: number, sy: number, ex: number, ey: number): string {
  return `M ${sx} ${sy} L ${ex} ${ey}`;
}

function UnlockEdge({
  x1, y1, x2, y2, gradientId, picked,
}: {
  x1: number; y1: number; x2: number; y2: number;
  gradientId: string;
  picked: boolean;
}) {
  const { sx, sy, ex, ey } = getAnchors(x1, y1, x2, y2);
  const path = straightPath(sx, sy, ex, ey);
  const stroke = `url(#${gradientId})`;

  return (
    <>
      <path d={path} className="graph-edge graph-edge--hit" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={picked ? 2.5 : 2}
        strokeLinecap="round"
      />
    </>
  );
}

function graphFingerprint(graph: QuestGraph): string {
  const p = graph.points.map((x) => x.id).sort().join(',');
  const e = graph.edges.map((x) => `${x.fromId}->${x.toId}`).sort().join(',');
  return `${p}|${e}`;
}

function pointsFingerprint(graph: QuestGraph): string {
  return graph.points.map((x) => x.id).sort().join(',');
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

const FIT_PAD = 56;

function boundsFromPositions(
  positions: { id: string; x: number; y: number }[],
  nodeHeights: Record<string, number>,
) {
  if (positions.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions) {
    const h = Math.max(NODE_H + 8, nodeHeights[p.id] ?? NODE_H + 8);
    minX = Math.min(minX, p.x - NODE_W / 2);
    maxX = Math.max(maxX, p.x + NODE_W / 2);
    minY = Math.min(minY, p.y - h / 2);
    maxY = Math.max(maxY, p.y + h / 2);
  }
  return { minX, minY, maxX, maxY };
}

function fitViewportToBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewWidth: number,
  viewHeight: number,
): Viewport {
  const boundsW = bounds.maxX - bounds.minX + FIT_PAD * 2;
  const boundsH = bounds.maxY - bounds.minY + FIT_PAD * 2;
  const scale = clampScale(Math.min(viewWidth / boundsW, viewHeight / boundsH, 1));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: viewWidth / 2 - cx * scale,
    y: viewHeight / 2 - cy * scale,
  };
}

export function GraphCanvas({
  graph,
  mode = 'view',
  editorPointId = null,
  selectedEdgeId = null,
  onEditPoint,
  onSelectEdge,
  onPositionsChange,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const clickBlockRef = useRef(false);
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const panRef = useRef<{
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startScale: number;
    pointerId: number;
  } | null>(null);
  const userAdjustedViewport = useRef(false);
  const autoViewportRef = useRef<Viewport | null>(null);
  const stablePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const prevPointIdsRef = useRef<Set<string>>(new Set());

  const [viewWidth, setViewWidth] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  const [livePositions, setLivePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState<Viewport | null>(null);

  const measureContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) {
      setViewWidth(w);
      setViewHeight(h);
    }
  }, []);

  useLayoutEffect(() => {
    measureContainer();
  }, [measureContainer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureContainer());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureContainer]);

  const contentWidth = useMemo(
    () => (viewWidth > 0 ? Math.max(viewWidth * 2.8, 1600) : 1600),
    [viewWidth],
  );

  const fp = graphFingerprint(graph);
  const pointFp = pointsFingerprint(graph);
  const contentHeight = estimateCanvasHeight(graph, contentWidth);

  const layoutPositions = useMemo(() => {
    if (viewWidth <= 0) return [];

    const currentIds = new Set(graph.points.map((p) => p.id));
    const newIds = new Set(
      graph.points.filter((p) => !prevPointIdsRef.current.has(p.id)).map((p) => p.id),
    );
    const fullLayout = computeLayout(graph, contentWidth, contentHeight);
    const layoutById = new Map(fullLayout.map((p) => [p.id, p]));

    for (const id of [...stablePositionsRef.current.keys()]) {
      if (!currentIds.has(id)) stablePositionsRef.current.delete(id);
    }

    const positions = graph.points.map((p) => {
      const saved = graph.positions?.[p.id];
      if (saved) {
        stablePositionsRef.current.set(p.id, saved);
        return { id: p.id, x: saved.x, y: saved.y };
      }

      if (newIds.has(p.id)) {
        const laid = layoutById.get(p.id) ?? { id: p.id, x: contentWidth / 2, y: contentHeight / 2 };
        stablePositionsRef.current.set(p.id, { x: laid.x, y: laid.y });
        return laid;
      }

      const stable = stablePositionsRef.current.get(p.id);
      if (stable) {
        return { id: p.id, x: stable.x, y: stable.y };
      }

      const laid = layoutById.get(p.id) ?? { id: p.id, x: contentWidth / 2, y: contentHeight / 2 };
      stablePositionsRef.current.set(p.id, { x: laid.x, y: laid.y });
      return laid;
    });

    prevPointIdsRef.current = currentIds;
    return positions;
  }, [pointFp, contentWidth, contentHeight, viewWidth, graph.positions, graph.points]);

  const autoViewport = useMemo(() => {
    if (viewWidth <= 0 || viewHeight <= 0 || layoutPositions.length === 0) return null;

    const map = new Map(layoutPositions.map((p) => [p.id, { ...p }]));
    if (graph.positions) {
      for (const [id, pos] of Object.entries(graph.positions)) {
        if (map.has(id)) map.set(id, { id, x: pos.x, y: pos.y });
      }
    }
    const bounds = boundsFromPositions([...map.values()], {});
    if (!bounds) return null;
    return fitViewportToBounds(bounds, viewWidth, viewHeight);
  }, [viewWidth, viewHeight, layoutPositions, graph.positions]);

  autoViewportRef.current = autoViewport;

  useEffect(() => {
    setViewport(null);
    userAdjustedViewport.current = false;
  }, [pointFp]);

  const displayViewport = viewport ?? autoViewport;
  const isViewportReady = displayViewport !== null;

  const posMap = useMemo(() => {
    const map = new Map(layoutPositions.map((p) => [p.id, { ...p }]));
    if (graph.positions) {
      for (const [id, pos] of Object.entries(graph.positions)) {
        if (map.has(id)) map.set(id, { id, x: pos.x, y: pos.y });
      }
    }
    for (const [id, pos] of Object.entries(livePositions)) {
      if (map.has(id)) map.set(id, { id, x: pos.x, y: pos.y });
    }
    return map;
  }, [layoutPositions, graph.positions, livePositions]);

  const hubIds = useMemo(() => getHubIds(graph), [fp]);

  const outgoingCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of graph.points) counts.set(p.id, 0);
    for (const e of graph.edges) {
      counts.set(e.fromId, (counts.get(e.fromId) ?? 0) + 1);
    }
    return counts;
  }, [fp]);

  const edgeGradients = useMemo(() => {
    return graph.edges.map((edge) => {
      const from = posMap.get(edge.fromId);
      const to = posMap.get(edge.toId);
      if (!from || !to) return null;
      const { sx, sy, ex, ey } = getAnchors(from.x, from.y, to.x, to.y);
      return {
        edgeId: edge.id,
        gradientId: `edge-grad-${edge.id}`,
        sx, sy, ex, ey,
      };
    }).filter(Boolean) as Array<{
      edgeId: string;
      gradientId: string;
      sx: number; sy: number; ex: number; ey: number;
    }>;
  }, [graph.edges, posMap]);

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const g = contentRef.current;
    const svg = svgRef.current;
    if (!g || !svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = g.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const clearTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) sel.removeAllRanges();
  }, []);

  const handlePanPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;

    const target = e.target as Element;
    if (target.closest('.graph-node__title--drag, .graph-node__desc-trigger, .graph-node__desc-full, .linkified-url')) {
      return;
    }
    if (target.closest('button, input, textarea, select, a[href]')) return;

    clearTextSelection();
    const base = viewport ?? autoViewportRef.current;
    if (!base) return;

    userAdjustedViewport.current = true;
    if (!viewport) setViewport(base);
    panRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: base.x,
      startY: base.y,
      startScale: base.scale,
      pointerId: e.pointerId,
    };
    setIsPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [viewport, clearTextSelection]);

  const handleNodePointerDown = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    clearTextSelection();
    const target = e.target as HTMLElement;
    if (target.closest('.graph-node__desc-trigger, .graph-node__desc-full, .linkified-url')) return;
    const pos = posMap.get(id);
    if (!pos) return;
    e.stopPropagation();
    const svgPt = clientToSvg(e.clientX, e.clientY);
    dragRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      offsetX: svgPt.x - pos.x,
      offsetY: svgPt.y - pos.y,
      moved: false,
      pointerId: e.pointerId,
    };
  }, [posMap, clientToSvg, clearTextSelection]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pan = panRef.current;
      if (pan && e.pointerId === pan.pointerId) {
        setViewport({
          scale: pan.startScale,
          x: pan.startX + (e.clientX - pan.startClientX),
          y: pan.startY + (e.clientY - pan.startClientY),
        });
        return;
      }

      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dist = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY);
      if (!d.moved && dist < 4) return;
      if (!d.moved) {
        d.moved = true;
        clickBlockRef.current = true;
        userAdjustedViewport.current = true;
        setDraggingId(d.id);
      }
      const svgPt = clientToSvg(e.clientX, e.clientY);
      setLivePositions((prev) => ({
        ...prev,
        [d.id]: { x: svgPt.x - d.offsetX, y: svgPt.y - d.offsetY },
      }));
    };

    const onUp = (e: PointerEvent) => {
      const pan = panRef.current;
      if (pan && e.pointerId === pan.pointerId) {
        panRef.current = null;
        setIsPanning(false);
        return;
      }

      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (d.moved) {
        const svgPt = clientToSvg(e.clientX, e.clientY);
        const newPos = { x: svgPt.x - d.offsetX, y: svgPt.y - d.offsetY };
        setLivePositions((prev) => ({ ...prev, [d.id]: newPos }));
        onPositionsChange?.({ ...(graph.positions ?? {}), [d.id]: newPos });
      }
      dragRef.current = null;
      setDraggingId(null);
      if (d.moved) {
        setTimeout(() => { clickBlockRef.current = false; }, 0);
      } else {
        clickBlockRef.current = false;
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [clientToSvg, graph.positions, onPositionsChange]);

  // Drop live overrides once saved positions match
  useEffect(() => {
    setLivePositions((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const [id, pos] of Object.entries(prev)) {
        const saved = graph.positions?.[id];
        if (saved && saved.x === pos.x && saved.y === pos.y) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [graph.positions]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    userAdjustedViewport.current = true;
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setViewport((v) => {
      const base = v ?? autoViewportRef.current ?? { x: 0, y: 0, scale: 1 };
      const delta = -e.deltaY * ZOOM_FACTOR;
      const newScale = clampScale(base.scale * (1 + delta));
      const scaleRatio = newScale / base.scale;
      return {
        scale: newScale,
        x: mx - (mx - base.x) * scaleRatio,
        y: my - (my - base.y) * scaleRatio,
      };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleCanvasClick = useCallback(() => {
    clearTextSelection();
    setExpandedId(null);
  }, [clearTextSelection]);

  const toggleExpand = (pointId: string) => {
    clearTextSelection();
    setExpandedId((cur) => (cur === pointId ? null : pointId));
  };

  const orderedPoints = useMemo(() => {
    if (!expandedId) return graph.points;
    const expanded = graph.points.find((p) => p.id === expandedId);
    if (!expanded) return graph.points;
    return [...graph.points.filter((p) => p.id !== expandedId), expanded];
  }, [graph.points, expandedId]);

  const EXPANDED_NODE_W = 260;

  const handleNodeResize = useCallback((pointId: string, h: number) => {
    setNodeHeights((prev) => {
      if (prev[pointId] === h) return prev;
      return { ...prev, [pointId]: h };
    });
  }, []);

  const canvasClass = [
    'graph-canvas',
    draggingId ? 'graph-canvas--dragging' : '',
    isPanning ? 'graph-canvas--panning' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={canvasClass}
      ref={containerRef}
      onPointerDown={handlePanPointerDown}
      onClick={handleCanvasClick}
    >
      <svg
        ref={svgRef}
        width={viewWidth}
        height={viewHeight}
        className={`graph-canvas__svg${isViewportReady ? '' : ' graph-canvas__svg--hidden'}`}
      >
        {displayViewport && (
        <g
          ref={contentRef}
          transform={`translate(${displayViewport.x}, ${displayViewport.y}) scale(${displayViewport.scale})`}
        >
          <defs>
            {edgeGradients.map((g) => (
              <linearGradient
                key={g.gradientId}
                id={g.gradientId}
                gradientUnits="userSpaceOnUse"
                x1={g.sx}
                y1={g.sy}
                x2={g.ex}
                y2={g.ey}
              >
                <stop offset="0%" stopColor={EDGE_LINE_COLOR} stopOpacity="0.1" />
                <stop offset="100%" stopColor={EDGE_LINE_COLOR} stopOpacity="0.95" />
              </linearGradient>
            ))}
          </defs>

          {graph.edges.map((edge) => {
            const from = posMap.get(edge.fromId);
            const to = posMap.get(edge.toId);
            if (!from || !to) return null;
            const picked = mode === 'edit' && selectedEdgeId === edge.id;
            return (
              <g
                key={edge.id}
                className={`graph-edge-group ${mode === 'edit' ? 'graph-edge-group--editable' : ''}`}
                onClick={(e) => {
                  if (mode !== 'edit' || !onSelectEdge) return;
                  e.stopPropagation();
                  onSelectEdge(edge.id);
                }}
              >
                <UnlockEdge
                  x1={from.x} y1={from.y}
                  x2={to.x} y2={to.y}
                  gradientId={`edge-grad-${edge.id}`}
                  picked={picked}
                />
              </g>
            );
          })}

          {orderedPoints.map((point) => {
            const pos = posMap.get(point.id);
            if (!pos) return null;
            const unlocks = outgoingCount.get(point.id) ?? 0;
            const isExpanded = expandedId === point.id;
            const isDimmed = expandedId !== null && !isExpanded;
            const slotWidth = isExpanded ? EXPANDED_NODE_W : NODE_W;
            const slotHeight = Math.max(NODE_H + 8, nodeHeights[point.id] ?? NODE_H + 8);

            return (
              <foreignObject
                key={point.id}
                x={pos.x - slotWidth / 2}
                y={pos.y - NODE_H / 2}
                width={slotWidth}
                height={slotHeight}
                className={[
                  isExpanded ? 'graph-node-slot--expanded' : '',
                  isDimmed ? 'graph-node-slot--dim' : '',
                  draggingId === point.id ? 'graph-node-slot--dragging' : '',
                ].filter(Boolean).join(' ') || undefined}
              >
                <GraphNode
                  point={point}
                  mode={mode}
                  isEditorSelected={mode === 'edit' && editorPointId === point.id}
                  isHub={hubIds.has(point.id)}
                  unlocksCount={unlocks}
                  expanded={isExpanded}
                  onToggleExpand={() => toggleExpand(point.id)}
                  onEditSelect={() => onEditPoint?.(point.id)}
                  onResize={(h) => handleNodeResize(point.id, h)}
                  onDragPointerDown={(e) => handleNodePointerDown(point.id, e)}
                  clickBlockRef={clickBlockRef}
                />
              </foreignObject>
            );
          })}
        </g>
        )}
      </svg>
    </div>
  );
}
