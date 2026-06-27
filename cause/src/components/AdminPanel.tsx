import { useState, useEffect, useRef } from 'react';
import { QuestGraph, QuestPoint, UnlockEdge } from '../types';
import { getInitialGraph, fetchGraph, persistGraph, newId } from '../utils/storage';
import { applyPointRename, applyPointCondition, reconcileConditionWithEdges, removeMentionFromCondition } from '../utils/mentions';
import { GraphCanvas } from './GraphCanvas';
import { ConditionInput } from './ConditionInput';

type Selection =
  | { type: 'point'; id: string }
  | { type: 'edge'; id: string }
  | null;

function PointNameInput({
  pointId,
  value,
  onCommit,
}: {
  pointId: string;
  value: string;
  onCommit: (title: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const activePointId = useRef(pointId);

  useEffect(() => {
    if (activePointId.current !== pointId) {
      activePointId.current = pointId;
      setDraft(value);
    }
  }, [pointId, value]);

  return (
    <input
      className="input input--uppercase"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const normalized = draft.toUpperCase();
        setDraft(normalized);
        if (normalized !== value) onCommit(normalized);
      }}
    />
  );
}

export function AdminPanel() {
  const [graph, setGraph] = useState<QuestGraph>(getInitialGraph);
  const [selection, setSelection] = useState<Selection>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const skipSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    fetchGraph()
      .then((loaded) => {
        if (cancelled) return;
        skipSave.current = true;
        setGraph(loaded);
        setLoadFailed(false);
        setSaveError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
          setLoadFailed(true);
          setSaveError('Could not load graph from server.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadFailed) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }

    setSaveState('saving');
    const timer = window.setTimeout(() => {
      persistGraph(graph)
        .then(() => {
          setSaveState('saved');
          setSaveError(null);
        })
        .catch((error) => {
          console.error(error);
          setSaveState('idle');
          setSaveError('Could not save changes.');
        });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [graph, loadFailed]);

  const updatePoint = (id: string, patch: Partial<QuestPoint>) => {
    setGraph((g) => ({
      ...g,
      points: g.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const updatePointCondition = (id: string, condition: string) => {
    setGraph((g) => applyPointCondition(g, id, condition));
  };

  useEffect(() => {
    if (selection?.type !== 'point') return;
    setGraph((g) => {
      const point = g.points.find((p) => p.id === selection.id);
      if (!point) return g;
      let next = applyPointCondition(g, point.id, point.condition);
      const synced = next.points.find((p) => p.id === point.id);
      if (!synced) return next;
      const condition = reconcileConditionWithEdges(point.id, synced.condition, next);
      if (condition === synced.condition) return next;
      return applyPointCondition(next, point.id, condition);
    });
  }, [selection?.type === 'point' ? selection.id : null]);

  const addPoint = () => {
    const n = graph.points.length + 1;
    const letter = String.fromCharCode(64 + ((n - 1) % 26) + 1);
    const point: QuestPoint = {
      id: newId('p'),
      title: `POINT ${letter}`,
      description: '',
      condition: '',
    };
    setGraph((g) => ({ ...g, points: [...g.points, point] }));
    setSelection({ type: 'point', id: point.id });
  };

  const addConnection = (fromId: string, toId: string, unlockCondition = '') => {
    if (fromId === toId) return;
    const existing = graph.edges.find((e) => e.fromId === fromId && e.toId === toId);
    if (existing) {
      setGraph((g) => ({
        ...g,
        edges: g.edges.map((e) =>
          e.id === existing.id
            ? { ...e, unlockCondition: unlockCondition || e.unlockCondition }
            : e,
        ),
      }));
      return;
    }
    const edge: UnlockEdge = {
      id: newId('e'),
      fromId,
      toId,
      unlockCondition,
    };
    setGraph((g) => ({ ...g, edges: [...g.edges, edge] }));
  };

  const deletePoint = (id: string) => {
    if (graph.points.length <= 1) return;
    setGraph((g) => {
      const positions = g.positions ? { ...g.positions } : undefined;
      if (positions) delete positions[id];
      return {
        points: g.points.filter((p) => p.id !== id),
        edges: g.edges.filter((e) => e.fromId !== id && e.toId !== id),
        positions: positions && Object.keys(positions).length > 0 ? positions : undefined,
      };
    });
    setSelection(null);
  };

  const deleteEdge = (id: string) => {
    setGraph((g) => {
      const edge = g.edges.find((e) => e.id === id);
      if (!edge) return g;

      const toPoint = g.points.find((p) => p.id === edge.toId);
      const fromPoint = g.points.find((p) => p.id === edge.fromId);
      const next = { ...g, edges: g.edges.filter((e) => e.id !== id) };

      if (!toPoint || !fromPoint) return next;

      const condition = removeMentionFromCondition(toPoint.condition, fromPoint.title);
      return applyPointCondition(next, edge.toId, condition);
    });
    setSelection(null);
  };

  const selectedPoint = selection?.type === 'point'
    ? graph.points.find((p) => p.id === selection.id)
    : null;

  const selectedEdge = selection?.type === 'edge'
    ? graph.edges.find((e) => e.id === selection.id)
    : null;

  const edgeFrom = selectedEdge
    ? graph.points.find((p) => p.id === selectedEdge.fromId)
    : null;
  const edgeTo = selectedEdge
    ? graph.points.find((p) => p.id === selectedEdge.toId)
    : null;

  return (
    <div className="admin">
      <header className="admin__header">
        <div className="admin__brand">
          <h1 className="admin__title">Cause Effect Map</h1>
          {saveState === 'saving' && <p className="admin__status">Saving…</p>}
          {saveState === 'saved' && !saveError && <p className="admin__status admin__status--saved">Saved</p>}
          {saveError && <p className="admin__error">{saveError}</p>}
        </div>
        <div className="admin__actions">
          <button type="button" className="btn btn--secondary btn--compact" onClick={addPoint}>
            + Add point
          </button>
        </div>
      </header>

      <div className="admin__body">
        <main className="admin__main">
          <GraphCanvas
            mode="edit"
            graph={graph}
            editorPointId={selection?.type === 'point' ? selection.id : null}
            selectedEdgeId={selection?.type === 'edge' ? selection.id : null}
            onEditPoint={(id) => setSelection({ type: 'point', id })}
            onSelectEdge={(id) => setSelection({ type: 'edge', id })}
            onPositionsChange={(positions) => setGraph((g) => ({ ...g, positions }))}
          />
        </main>

        <aside className="admin__editor">
          {selectedPoint && (
            <section className="panel panel--editor">
              <h2 className="panel__title">Edit point</h2>
              <label className="field">
                <span className="field__label">Name</span>
                <PointNameInput
                  pointId={selectedPoint.id}
                  value={selectedPoint.title}
                  onCommit={(title) =>
                    setGraph((g) => applyPointRename(g, selectedPoint.id, title))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Short description</span>
                <textarea
                  className="input input--area"
                  rows={3}
                  value={selectedPoint.description}
                  onChange={(e) => updatePoint(selectedPoint.id, { description: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label field__label--bookshelf">
                  what must be true to unlock?
                </span>
                <ConditionInput
                  value={selectedPoint.condition}
                  onChange={(condition) => updatePointCondition(selectedPoint.id, condition)}
                  points={graph.points}
                  currentPointId={selectedPoint.id}
                  onConnect={(fromId, toId, unlockCondition) =>
                    addConnection(fromId, toId, unlockCondition)
                  }
                />
              </label>
              {graph.points.length > 1 && (
                <button
                  type="button"
                  className="btn btn--ghost btn--danger"
                  onClick={() => deletePoint(selectedPoint.id)}
                >
                  Delete point
                </button>
              )}
            </section>
          )}

          {selectedEdge && edgeFrom && edgeTo && (
            <section className="panel panel--editor">
              <p className="panel__unlock-headline">
                <span className="unlock-from">{edgeFrom.title}</span>
                <span className="unlock-arrow"> → </span>
                <span className="unlock-to">{edgeTo.title}</span>
              </p>
              <button
                type="button"
                className="btn btn--ghost btn--danger"
                onClick={() => deleteEdge(selectedEdge.id)}
              >
                Remove connection
              </button>
            </section>
          )}

          {!selectedPoint && !selectedEdge && (
            <section className="panel panel--editor panel--empty">
              <p>Click a point to edit. Click … on a description to preview it on the map.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
