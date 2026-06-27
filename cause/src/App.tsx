import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminPanel } from './components/AdminPanel';
import { QuestView } from './components/QuestView';

export default function App() {
  return (
    <BrowserRouter basename="/cause">
      <Routes>
        <Route path="/" element={<QuestView />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
