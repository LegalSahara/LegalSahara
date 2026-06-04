import React from 'react';
import { Edit3, Database, Brain, Plus } from 'lucide-react';
import { formatTime } from '../../api';

const FEATURES = [
  { id: 'drafter',    icon: Edit3,    label: 'Petition drafter' },
  { id: 'rag',        icon: Database, label: 'Precedent search' },
  { id: 'summarizer', icon: Brain,    label: 'Case briefing' },
];

export default function Sidebar({
  user,
  activeFeature, setFeat,
  drafterHistory, ragHistory, summaryHistory,
  activeDraftSession,   setActiveDraftSession,
  activeRagSession,     setActiveRagSession,
  activeSummarySession, setActiveSummarySession,
}) {
  const renderHistory = () => {
    if (activeFeature === 'drafter') {
      if (drafterHistory.length === 0) return <p className="ws__hist-empty">No sessions yet</p>;
      return drafterHistory.slice().reverse().map((s) => (
        <button
          key={s.id}
          onClick={() => setActiveDraftSession(s)}
          className={`ws__hist-item ${activeDraftSession?.id === s.id ? 'ws__hist-item--active' : ''}`}>
          <div className="ws__hist-item-title">{s.label}</div>
          <div className="ws__hist-item-meta">{formatTime(s.ts)}</div>
        </button>
      ));
    }
    if (activeFeature === 'rag') {
      if (ragHistory.length === 0) return <p className="ws__hist-empty">No searches yet</p>;
      return ragHistory.slice().reverse().map((s) => (
        <button
          key={s.id}
          onClick={() => setActiveRagSession(s)}
          className={`ws__hist-item ${activeRagSession?.id === s.id ? 'ws__hist-item--active' : ''}`}>
          <div className="ws__hist-item-title">
            {s.query?.slice(0, 60)}{s.query?.length > 60 ? '…' : ''}
          </div>
          <div className="ws__hist-item-meta">{formatTime(s.ts)}</div>
        </button>
      ));
    }
    // summarizer
    if (summaryHistory.length === 0) return <p className="ws__hist-empty">No documents yet</p>;
    return summaryHistory.slice().reverse().map((s) => (
      <button
        key={s.id}
        onClick={() => setActiveSummarySession(s)}
        className={`ws__hist-item ${activeSummarySession?.id === s.id ? 'ws__hist-item--active' : ''}`}>
        <div className="ws__hist-item-title">{s.filename || s.label}</div>
        <div className="ws__hist-item-meta">{formatTime(s.ts)}</div>
      </button>
    ));
  };

  const handleNewSession = () => {
    if (activeFeature === 'drafter') setActiveDraftSession(null);
    if (activeFeature === 'rag') setActiveRagSession(null);
    if (activeFeature === 'summarizer') setActiveSummarySession(null);
  };

  return (
    <aside className="ws__side">
      <div className="ws__user">
        <p className="ls-label" style={{ marginBottom: 2 }}>Signed in as</p>
        <p className="ws__user-name">{user?.full_name || 'Advocate'}</p>
        <p className="ws__user-plan">{user?.license_type || 'Free'}</p>
      </div>

      <div className="ws__tabs">
        {FEATURES.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setFeat(id)}
            className={`ws__tab ${activeFeature === id ? 'ws__tab--active' : ''}`}>
            <Icon size={16} strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="ws__hist">
        <p className="ws__hist-label">History</p>
        {renderHistory()}
      </div>

      <button className="ws__newbtn" onClick={handleNewSession}>
        <Plus size={14} strokeWidth={2} /> New session
      </button>
    </aside>
  );
}
