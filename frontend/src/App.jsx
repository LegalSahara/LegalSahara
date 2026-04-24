import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { useReveal } from './hooks/useReveal';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import PricingPage from './pages/PricingPage';
import AuthPage from './pages/AuthPage';
import Workspace from './pages/workspace/Workspace';

export default function App() {
  const [page, setPage]           = useState('landing');
  const [user, setUser]           = useState(null);
  const [activeFeature, setFeat]  = useState('drafter');
  const [apiOnline, setOnline]    = useState(null);

  // Session history (cache of Postgres-persisted sessions)
  const [drafterHistory, setDrafterHistory] = useState([]);
  const [ragHistory,     setRagHistory]     = useState([]);
  const [summaryHistory, setSummaryHistory] = useState([]);

  // Active-session pointers (null = new session)
  const [activeDraftSession,   setActiveDraftSession]   = useState(null);
  const [activeRagSession,     setActiveRagSession]     = useState(null);
  const [activeSummarySession, setActiveSummarySession] = useState(null);

  // ── Load all sessions for the logged-in user ───────────────────────────
  const loadSessions = async () => {
    try {
      const r = await api.getSessions();
      if (r.status !== 'ok') return;
      const sessions = r.sessions.map((s) => ({
        ...s,
        ...s.data,
        ts: new Date(s.created_at).getTime(),
      }));
      setDrafterHistory(sessions.filter((s) => s.feature === 'drafter'));
      setRagHistory(    sessions.filter((s) => s.feature === 'rag'));
      setSummaryHistory(sessions.filter((s) => s.feature === 'summarizer'));
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

  // ── Auth + health polling ──────────────────────────────────────────────
  useEffect(() => {
    api.health().then(setOnline);
    const id = setInterval(() => api.health().then(setOnline), 30000);

    const checkAuth = async () => {
      if (!api.getToken()) return;
      const r = await api.verifyToken();
      if (r.status === 'ok') { setUser(r.user); await loadSessions(); }
      else api.clearToken();
    };
    checkAuth();

    return () => clearInterval(id);
  }, []);

  // Re-run scroll reveal when page changes (fresh elements mount)
  useReveal([page]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const nav = useCallback((p) => {
    setPage(p);
    window.scrollTo(0, 0);
  }, []);

  const doLogin = async (u) => {
    setUser(u);
    await loadSessions();
    nav('workspace');
  };

  const doLogout = () => {
    api.clearToken();
    setUser(null);
    setDrafterHistory([]); setRagHistory([]); setSummaryHistory([]);
    setActiveDraftSession(null);
    setActiveRagSession(null);
    setActiveSummarySession(null);
    nav('landing');
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar
        page={page}
        user={user}
        apiOnline={apiOnline}
        nav={nav}
        doLogout={doLogout}
      />

      {page === 'landing'   && <LandingPage user={user} nav={nav} />}
      {page === 'pricing'   && <PricingPage nav={nav} />}
      {page === 'login'     && <AuthPage type="login"  nav={nav} doLogin={doLogin} />}
      {page === 'signup'    && <AuthPage type="signup" nav={nav} doLogin={doLogin} />}
      {page === 'workspace' && (
        <Workspace
          user={user}
          activeFeature={activeFeature}
          setFeat={setFeat}
          drafterHistory={drafterHistory}
          setDrafterHistory={setDrafterHistory}
          ragHistory={ragHistory}
          setRagHistory={setRagHistory}
          summaryHistory={summaryHistory}
          setSummaryHistory={setSummaryHistory}
          activeDraftSession={activeDraftSession}
          setActiveDraftSession={setActiveDraftSession}
          activeRagSession={activeRagSession}
          setActiveRagSession={setActiveRagSession}
          activeSummarySession={activeSummarySession}
          setActiveSummarySession={setActiveSummarySession}
        />
      )}
    </>
  );
}
