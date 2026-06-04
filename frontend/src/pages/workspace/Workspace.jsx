import React from 'react';
import Sidebar from './Sidebar';
import DrafterPanel from './DrafterPanel';
import RAGPanel from './RAGPanel';
import SummaryPanel from './SummaryPanel';
import { api } from '../../api';

export default function Workspace({
  user,
  activeFeature, setFeat,
  drafterHistory, setDrafterHistory,
  ragHistory,     setRagHistory,
  summaryHistory, setSummaryHistory,
  activeDraftSession,   setActiveDraftSession,
  activeRagSession,     setActiveRagSession,
  activeSummarySession, setActiveSummarySession,
}) {
  return (
    <div className="ws">
      <Sidebar
        user={user}
        activeFeature={activeFeature}
        setFeat={setFeat}
        drafterHistory={drafterHistory}
        ragHistory={ragHistory}
        summaryHistory={summaryHistory}
        activeDraftSession={activeDraftSession}
        setActiveDraftSession={setActiveDraftSession}
        activeRagSession={activeRagSession}
        setActiveRagSession={setActiveRagSession}
        activeSummarySession={activeSummarySession}
        setActiveSummarySession={setActiveSummarySession}
      />

      <main className="ws__main">
        {activeFeature === 'drafter' && (
          <DrafterPanel
            key={activeDraftSession?.id || 'new'}
            session={activeDraftSession}
            onSave={(s) => {
              setDrafterHistory((h) => [...h, s]);
              setActiveDraftSession(s);
            }}
            onUpdate={async (id, changes) => {
              setDrafterHistory((h) => h.map((s) => (s.id === id ? { ...s, ...changes } : s)));
              try { await api.updateSession(id, { data: changes }); } catch {}
            }}
          />
        )}

        {activeFeature === 'rag' && (
          <RAGPanel
            key="rag-panel" // 
            session={activeRagSession}
            onSave={(s) => {
              setRagHistory((h) => [...h, s]);
              setActiveRagSession(s);
            }}
          />
        )}

        {activeFeature === 'summarizer' && (
          <SummaryPanel
            key={activeSummarySession?.id || 'sum'}
            session={activeSummarySession}
            onSave={(s) => {
              setSummaryHistory((h) => [...h, s]);
              setActiveSummarySession(s);
            }}
          />
        )}
      </main>
    </div>
  );
}