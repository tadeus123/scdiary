import { useState, useEffect } from 'react';
import { QuestGraph } from '../types';
import { loadGraph, saveGraph } from '../utils/storage';
import { GraphCanvas } from './GraphCanvas';

export function QuestView() {
  const [graph, setGraph] = useState<QuestGraph>(loadGraph);

  useEffect(() => {
    const refresh = () => setGraph(loadGraph());
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return (
    <div className="map-fullscreen">
      <nav className="map-header" aria-label="Site">
        <span className="map-header__title">cause effect map</span>
      </nav>
      <GraphCanvas
        graph={graph}
        mode="view"
        onPositionsChange={(positions) => {
          const updated = { ...graph, positions };
          setGraph(updated);
          saveGraph(updated);
        }}
      />
    </div>
  );
}
