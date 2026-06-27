import { useState, useEffect, useRef } from 'react';
import { QuestGraph } from '../types';
import { getInitialGraph, fetchGraph, persistGraph } from '../utils/storage';
import { GraphCanvas } from './GraphCanvas';

export function QuestView() {
  const [graph, setGraph] = useState<QuestGraph>(getInitialGraph);
  const saveTimer = useRef<number | null>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  useEffect(() => {
    let cancelled = false;
    fetchGraph()
      .then((loaded) => {
        if (!cancelled) setGraph(loaded);
      })
      .catch((error) => console.error(error));

    const onFocus = () => {
      fetchGraph()
        .then((loaded) => setGraph(loaded))
        .catch((error) => console.error(error));
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const scheduleSave = (updated: QuestGraph) => {
    setGraph(updated);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persistGraph(updated).catch((error) => console.error(error));
    }, 400);
  };

  return (
    <div className="map-fullscreen">
      <nav className="map-header" aria-label="Site">
        <span className="map-header__title">cause effect map</span>
      </nav>
      <GraphCanvas
        graph={graph}
        mode="view"
        onPositionsChange={(positions) => {
          scheduleSave({ ...graphRef.current, positions });
        }}
      />
    </div>
  );
}
