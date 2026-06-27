import { useState, useEffect, useRef } from 'react';
import { QuestGraph } from '../types';
import { createDefaultGraph, fetchGraph, persistGraph } from '../utils/storage';
import { GraphCanvas } from './GraphCanvas';

export function QuestView() {
  const [graph, setGraph] = useState<QuestGraph>(createDefaultGraph);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<number | null>(null);

  const reload = () => {
    fetchGraph()
      .then(setGraph)
      .catch((error) => console.error(error));
  };

  useEffect(() => {
    let cancelled = false;
    fetchGraph()
      .then((loaded) => {
        if (!cancelled) setGraph(loaded);
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onFocus = () => reload();
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

  if (loading) {
    return (
      <div className="map-fullscreen map-fullscreen--loading">
        <p className="map-header__title">Loading…</p>
      </div>
    );
  }

  return (
    <div className="map-fullscreen">
      <nav className="map-header" aria-label="Site">
        <span className="map-header__title">cause effect map</span>
      </nav>
      <GraphCanvas
        graph={graph}
        mode="view"
        onPositionsChange={(positions) => {
          scheduleSave({ ...graph, positions });
        }}
      />
    </div>
  );
}
