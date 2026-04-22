import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Scale, FileText, Search, Shield, UploadCloud, Download, Edit3,
  CheckCircle2, ChevronRight, LogOut, File, BookOpen, Gavel,
  ArrowRight, FileCheck2, Loader2, AlertCircle, X, Menu,
  Sparkles, ScrollText, Send, RotateCcw, Copy, Check,
  Brain, Database, FileDown,
} from 'lucide-react';

// ─── API layer ────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL || '';

const api = {
  setToken(t)  { localStorage.setItem('access_token', t); },
  getToken()   { return localStorage.getItem('access_token'); },
  clearToken() { localStorage.removeItem('access_token'); },
  getAuthHeaders() {
    const t = this.getToken();
    return { Authorization: t ? `Bearer ${t}` : '' };
  },

  async login(email, password) {
    const form = new FormData();
    form.append('email', email);
    form.append('password', password);
    const res  = await fetch(`${API_BASE}/auth/login`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.status === 'ok') this.setToken(data.access_token);
    return data;
  },

  async signup(email, password, fullName) {
    const form = new FormData();
    form.append('email', email);
    form.append('password', password);
    form.append('full_name', fullName);
    const res  = await fetch(`${API_BASE}/auth/signup`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.status === 'ok') this.setToken(data.access_token);
    return data;
  },

  async verifyToken() {
    const res = await fetch(`${API_BASE}/auth/verify`, {
      headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  async draft(story) {
    const form = new FormData();
    form.append('story', story);
    form.append('user_id', 'web_user');
    const res = await fetch(`${API_BASE}/draft`, {
      method: 'POST', body: form, headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  async rag(query) {
    const form = new FormData();
    form.append('query', query);
    const res = await fetch(`${API_BASE}/rag`, {
      method: 'POST', body: form, headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  async summarize(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/summarize`, {
      method: 'POST', body: form, headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  async draftPdf(petitionText) {
    const form = new FormData();
    form.append('petition_text', petitionText);
    const res = await fetch(`${API_BASE}/draft/pdf`, {
      method: 'POST', body: form, headers: this.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`PDF endpoint returned ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  async health() {
    try { return (await fetch(`${API_BASE}/health`)).ok; }
    catch { return false; }
  },
};

function downloadTxt(text, filename = 'petition.txt') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = filename; a.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED GUARDRAIL BANNER  ← Fix #2: one component, used everywhere
// severity: 'block' | 'warn'
// ─────────────────────────────────────────────────────────────────────────────
function GuardrailBanner({ severity, message, warnings = [], onDismiss }) {
  if (!message && warnings.length === 0) return null;

  const isBlock = severity === 'block';

  // Visual tokens — same language, same spacing, same icon treatment everywhere
  const tokens = isBlock
    ? {
        bg:     '#FEF2F2',
        border: '#FCA5A5',
        accent: '#DC2626',
        label:  'Request Blocked',
        Icon:   AlertCircle,
        textColor: '#7F1D1D',
      }
    : {
        bg:     '#FFFBEB',
        border: '#FCD34D',
        accent: '#B8960C',
        label:  `Review Before Filing — ${warnings.length} Notice${warnings.length !== 1 ? 's' : ''}`,
        Icon:   AlertCircle,
        textColor: '#78350F',
      };

  const { bg, border, accent, label, Icon, textColor } = tokens;

  return (
    <div style={{
      margin: '16px 24px 0',
      padding: '14px 18px',
      background: bg,
      border: `1px solid ${border}`,
      borderLeft: `4px solid ${accent}`,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 2,
    }}>
      <Icon style={{ width: 14, height: 14, color: accent, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: accent, marginBottom: 6,
        }}>
          {label}
        </div>
        {message && (
          <p style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: 15, color: textColor, lineHeight: 1.6,
            marginBottom: warnings.length ? 6 : 0,
          }}>
            {message}
          </p>
        )}
        {warnings.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {warnings.map((w, i) => (
              <li key={i} style={{
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: 15, color: textColor, lineHeight: 1.55,
                display: 'flex', gap: 8,
              }}>
                <span style={{ color: accent, flexShrink: 0 }}>—</span> {w}
              </li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} style={{ color: border, flexShrink: 0 }}>
          <X style={{ width: 12, height: 12 }} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS DOT
// ─────────────────────────────────────────────────────────────────────────────
const StatusDot = ({ online }) => (
  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}
        className={`flex items-center gap-1.5 ${online ? 'text-emerald-700' : 'text-red-600'}`}>
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-600' : 'bg-red-500'}`} />
    {online === null ? 'Checking' : online ? 'Systems Online' : 'Offline'}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [page,           setPage]           = useState('landing');
  const [isLoggedIn,     setIsLoggedIn]     = useState(false);
  const [activeTab,      setActiveTab]      = useState('drafter');
  const [apiOnline,      setApiOnline]      = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser,    setCurrentUser]    = useState(null);

  useEffect(() => {
    api.health().then(setApiOnline);
    const id = setInterval(() => api.health().then(setApiOnline), 30000);

    // Re-hydrate session from stored token
    const checkAuth = async () => {
      const token = api.getToken();
      if (!token) return;
      const result = await api.verifyToken();
      if (result.status === 'ok') {
        setIsLoggedIn(true);
        setCurrentUser(result.user);
      } else {
        api.clearToken();
      }
    };
    checkAuth();

    return () => clearInterval(id);
  }, []);

  const navigate = useCallback((p) => {
    setPage(p); setMobileMenuOpen(false); window.scrollTo(0, 0);
  }, []);

  const doLogin = (user) => { setCurrentUser(user); setIsLoggedIn(true); navigate('workspace'); };
  const doLogout = () => { api.clearToken(); setCurrentUser(null); setIsLoggedIn(false); navigate('landing'); };

  // ── Navbar ──────────────────────────────────────────────────────────────────
  const Navbar = () => (
    <nav style={{ background: '#0C1B33', borderBottom: '1px solid #1E3A5F' }} className="sticky top-0 z-50">
      <div style={{ height: 2, background: 'linear-gradient(90deg, #B8960C, #D4AF37, #B8960C)' }} />
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center" style={{ height: 60 }}>
          <button onClick={() => navigate('landing')} className="flex items-center gap-3">
            <Scale style={{ width: 20, height: 20, color: '#D4AF37' }} />
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, fontWeight: 600, color: 'white' }}>
              Legal Sahara
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#D4AF37', border: '1px solid #B8960C', padding: '2px 6px' }}>
              AI
            </span>
          </button>

          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => navigate('landing')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9CA8BC' }} className="hover:text-white transition-colors">Platform</button>
            <button onClick={() => navigate('pricing')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9CA8BC' }} className="hover:text-white transition-colors">Retainers</button>
            <div style={{ width: 1, height: 16, background: '#2A3F5F' }} />
            <StatusDot online={apiOnline} />
            <div style={{ width: 1, height: 16, background: '#2A3F5F' }} />
            {isLoggedIn ? (
              <div className="flex items-center gap-4">
                <button onClick={() => navigate('workspace')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#D4AF37' }} className="hover:text-yellow-200 transition-colors">Workspace</button>
                <button onClick={doLogout} style={{ color: '#6B7F9E' }} className="hover:text-red-400 transition-colors"><LogOut style={{ width: 14, height: 14 }} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button onClick={() => navigate('login')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9CA8BC' }} className="hover:text-white transition-colors">Login</button>
                <button onClick={() => navigate('signup')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', background: '#D4AF37', color: '#0C1B33', padding: '8px 16px', fontWeight: 500 }} className="hover:opacity-90 transition-opacity">
                  Apply for Access
                </button>
              </div>
            )}
          </div>
          <button className="md:hidden" style={{ color: '#9CA8BC' }} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <div style={{ background: '#0C1B33', borderTop: '1px solid #1E3A5F' }} className="md:hidden px-6 py-4 space-y-3">
          <button onClick={() => navigate('landing')} className="block w-full text-left text-sm" style={{ color: '#9CA8BC' }}>Platform</button>
          <button onClick={() => navigate('pricing')} className="block w-full text-left text-sm" style={{ color: '#9CA8BC' }}>Retainers</button>
          {isLoggedIn ? (
            <>
              <button onClick={() => navigate('workspace')} className="block w-full text-left text-sm" style={{ color: '#D4AF37' }}>Workspace</button>
              <button onClick={doLogout} className="block w-full text-left text-sm text-red-400">Logout</button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('login')} className="block w-full text-left text-sm" style={{ color: '#9CA8BC' }}>Login</button>
              <button onClick={() => navigate('signup')} className="block w-full text-sm font-bold text-center py-2" style={{ background: '#D4AF37', color: '#0C1B33' }}>Apply for Access</button>
            </>
          )}
        </div>
      )}
    </nav>
  );

  // ── Landing ──────────────────────────────────────────────────────────────────
  const LandingPage = () => (
    <div style={{ background: 'linear-gradient(135deg,#03082E 0%,#0A1628 60%,#0F2044 100%)', minHeight: '100vh' }}>
      <div className="relative max-w-7xl mx-auto px-4 pt-28 pb-36">
        <div className="inline-flex items-center gap-2 mb-8" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '6px 16px' }}>
          <Sparkles style={{ width: 14, height: 14, color: '#D4AF37' }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#CBD5E1', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Pakistan's First Agentic Legal AI</span>
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(40px,6vw,70px)', fontWeight: 700, color: 'white', lineHeight: 1.1, marginBottom: 24, maxWidth: '56rem' }}>
          The Standard for <br />
          <span style={{ fontStyle: 'italic', color: '#D4AF37' }}>Legal Intelligence</span>
          <br />in Pakistan.
        </h1>
        <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 18, color: '#94A3B8', lineHeight: 1.8, maxWidth: '42rem', marginBottom: 40, borderLeft: '2px solid rgba(184,134,11,0.5)', paddingLeft: 20 }}>
          Empowering High Court and Supreme Court advocates with Agentic AI. Research PLD &amp; SCMR precedents, brief case files, and draft court-ready petitions.
        </p>
        <div className="flex flex-wrap gap-4">
          <button onClick={() => navigate('login')} style={{ background: '#D4AF37', color: '#0C1B33', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 8 }} className="hover:opacity-90 transition-opacity">
            Access Workspace <ArrowRight style={{ width: 14, height: 14 }} />
          </button>
          <button onClick={() => navigate('pricing')} style={{ background: 'transparent', color: 'white', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 32px', border: '1px solid rgba(255,255,255,0.2)' }} className="hover:border-white transition-colors">
            View Retainers
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[['10,482+','Judgments Indexed'],['5 Types','Petition Formats'],['PLD / SCMR','Citation Authority'],['< 90s','Avg. Draft Time']].map(([n,l],i) => (
            <div key={i} className="text-center">
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, fontWeight: 700, color: '#D4AF37' }}>{n}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#64748B', marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-24">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: BookOpen, title: 'Precedent Research', desc: 'Semantic + BM25 hybrid search across 10,000+ indexed judgments. Retrieve ratio decidendi with PLD → SCMR → YLR authority ranking.', badge: 'Vector DB' },
            { icon: FileCheck2, title: 'Case File Briefing', desc: 'Upload FIRs, charge sheets, or court orders. Receive a structured legal memo covering facts, issues, holding, and ratio decidendi.', badge: 'OCR Enabled' },
            { icon: Gavel, title: 'Agentic Drafting + PDF', desc: 'Classifies your case, detects red flags, retrieves precedents, and auto-formats all 5 petition types — exported as court-ready PDF.', badge: 'LangGraph + PDF' },
          ].map(({ icon: Icon, title, desc, badge }, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, padding: 32 }} className="hover:bg-white/5 transition-colors">
              <div className="flex items-start justify-between mb-6">
                <div style={{ width: 48, height: 48, background: 'rgba(30,64,128,0.3)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon style={{ width: 22, height: 22, color: '#D4AF37' }} />
                </div>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(212,175,55,0.7)', background: 'rgba(212,175,55,0.1)', padding: '3px 8px', border: '1px solid rgba(212,175,55,0.2)' }}>{badge}</span>
              </div>
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 12 }}>{title}</h3>
              <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#94A3B8', lineHeight: 1.7 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }} className="py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Scale style={{ width: 16, height: 16, color: 'rgba(212,175,55,0.6)' }} />
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, fontWeight: 700, color: '#64748B' }}>Legal Sahara</span>
          </div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#475569', textAlign: 'center', letterSpacing: '0.08em' }}>
            Not a substitute for qualified legal advice. Always verify AI-generated content with a licensed advocate.
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#334155', letterSpacing: '0.08em' }}>© 2026 Legal Sahara</p>
        </div>
      </div>
    </div>
  );

  // ── Pricing ───────────────────────────────────────────────────────────────────
  const PricingPage = () => (
    <div style={{ background: 'linear-gradient(135deg,#03082E 0%,#0A1628 100%)', minHeight: '90vh' }} className="py-24">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 38, fontWeight: 700, color: 'white' }}>Software Retainers</h2>
          <div style={{ width: 40, height: 2, background: '#D4AF37', margin: '12px auto 0' }} />
        </div>
        <div className="grid md:grid-cols-3" style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          {[
            { name: 'Academic / Junior', price: '0', features: ['5 Precedent Queries / month', 'Standard Drafting Assistant', 'Basic Text Summarization'], cta: 'Get Started' },
            { name: 'Advocate Pro', price: '2,500', features: ['250 Precedent Queries / month', 'Full PDF Briefing Engine', 'Court-Ready PDF Export', 'Priority Processing'], cta: 'Select Pro', highlight: true },
            { name: 'Chamber / Firm', price: '10,000', features: ['Unlimited Agent Usage', 'Custom Firm Precedents', 'Multi-user Access (5)', 'Dedicated Support'], cta: 'Contact Us' },
          ].map((plan, i) => (
            <div key={i} style={{ padding: '36px 28px', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.08)' : 'none', background: plan.highlight ? 'linear-gradient(160deg,#1E4080,#163058)' : 'rgba(255,255,255,0.02)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {plan.highlight && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#B8960C,#D4AF37,#B8960C)' }} />}
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 4 }}>{plan.name}</h3>
              <div style={{ margin: '16px 0', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#64748B' }}>Rs. </span>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 40, fontWeight: 700, color: 'white' }}>{plan.price}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#64748B', marginLeft: 4 }}>/mo</span>
              </div>
              <ul style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <CheckCircle2 style={{ width: 13, height: 13, color: plan.highlight ? '#D4AF37' : '#475569', flexShrink: 0, marginTop: 3 }} />
                    <span style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: plan.highlight ? '#CBD5E1' : '#94A3B8' }}>{f}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => navigate('signup')} style={{ width: '100%', padding: '12px 0', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', background: plan.highlight ? '#D4AF37' : 'rgba(255,255,255,0.06)', color: plan.highlight ? '#0C1B33' : 'white', border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.1)' }} className="hover:opacity-90 transition-opacity">
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Auth Page  (Fix #3 — real signup form) ────────────────────────────────────
  const AuthPage = ({ type }) => {
    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');

    const handleSubmit = async () => {
      if (!email || !password || (type === 'signup' && !fullName)) {
        setError('Please fill in all fields.'); return;
      }
      setLoading(true); setError('');
      try {
        const result = type === 'login'
          ? await api.login(email, password)
          : await api.signup(email, password, fullName);

        if (result.status === 'ok') {
          doLogin(result.user);
        } else {
          setError(result.message || 'Authentication failed.');
        }
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div style={{ background: 'linear-gradient(135deg,#03082E 0%,#0A1628 100%)', minHeight: '90vh' }} className="flex items-center justify-center px-4">
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ background: '#0C1B33', border: '1px solid #1E3A5F', borderRadius: 2 }}>
            <div style={{ background: '#071325', padding: '32px 40px', textAlign: 'center', position: 'relative', borderBottom: '1px solid #1E3A5F' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #B8960C, #D4AF37)' }} />
              <Scale style={{ width: 24, height: 24, color: '#D4AF37', margin: '0 auto 12px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: 'white' }}>
                {type === 'login' ? 'Chamber Login' : 'Create Account'}
              </h2>
            </div>

            <div style={{ padding: '36px 40px' }}>
              {error && (
                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 2, padding: '10px 14px' }}>
                  <AlertCircle style={{ width: 14, height: 14, color: '#DC2626', flexShrink: 0 }} />
                  <span style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 14, color: '#FCA5A5' }}>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {type === 'signup' && (
                  <div>
                    <label style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }}>Advocate Name</label>
                    <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Ali Khan, Advocate"
                      disabled={loading}
                      style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid #1E3A5F', color: 'white', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, outline: 'none' }}
                      onFocus={e => e.target.style.borderColor = '#D4AF37'}
                      onBlur={e => e.target.style.borderColor = '#1E3A5F'}
                    />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }}>Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={type === 'login' ? 'advocate@legal-sahara.com' : 'name@lawfirm.com.pk'}
                    disabled={loading} onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid #1E3A5F', color: 'white', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, outline: 'none' }}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'}
                    onBlur={e => e.target.style.borderColor = '#1E3A5F'}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                    disabled={loading} onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid #1E3A5F', color: 'white', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, outline: 'none' }}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'}
                    onBlur={e => e.target.style.borderColor = '#1E3A5F'}
                  />
                </div>

                {type === 'login' && (
                  <div style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 2, padding: '10px 14px' }}>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#D4AF37', marginBottom: 4 }}>Demo Account</p>
                    <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 14, color: '#94A3B8' }}>advocate@legal-sahara.com &nbsp;/&nbsp; demo123</p>
                  </div>
                )}

                <button onClick={handleSubmit} disabled={loading}
                  style={{ width: '100%', padding: '13px 0', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', background: loading ? '#1E3A5F' : '#D4AF37', color: loading ? '#64748B' : '#0C1B33', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}
                  className="hover:opacity-90 transition-opacity">
                  {loading
                    ? <span className="flex items-center justify-center gap-2"><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Processing…</span>
                    : type === 'login' ? 'Authenticate' : 'Create Account'}
                </button>
              </div>

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #1E3A5F', textAlign: 'center' }}>
                <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#64748B' }}>
                  {type === 'login' ? "Don't have an account? " : 'Already have access? '}
                  <button onClick={() => navigate(type === 'login' ? 'signup' : 'login')}
                    style={{ color: '#D4AF37', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    {type === 'login' ? 'Register here' : 'Log in'}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Workspace ─────────────────────────────────────────────────────────────────
  const Workspace = () => {
    const navItems = [
      { id: 'drafter',    icon: Edit3,    label: 'Agentic Drafter',  desc: 'Draft petitions' },
      { id: 'rag',        icon: Database, label: 'Precedent Search', desc: 'Case research' },
      { id: 'summarizer', icon: Brain,    label: 'Case Briefing',    desc: 'Summarize documents' },
    ];
    const initials = currentUser?.full_name?.split(' ').map(n => n[0]).join('') || 'AK';

    return (
      <div className="flex" style={{ minHeight: 'calc(100vh - 62px)', background: '#07101F' }}>
        <aside style={{ width: 220, flexShrink: 0, background: '#040C1A', borderRight: '1px solid #1E3A5F', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #1E3A5F' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 34, height: 34, background: '#D4AF37', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 13, color: '#0C1B33', flexShrink: 0 }}>{initials}</div>
              <div>
                <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: 'white', fontWeight: 500 }}>{currentUser?.full_name || 'Advocate'}</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#D4AF37' }}>{currentUser?.license_type || 'Free'} License</p>
              </div>
            </div>
          </div>
          <div style={{ padding: '12px', flex: 1 }}>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {navItems.map(({ id, icon: Icon, label, desc }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: activeTab === id ? '#D4AF37' : 'transparent', borderLeft: activeTab === id ? '2px solid #B8960C' : '2px solid transparent', textAlign: 'left', transition: 'all 0.15s', cursor: 'pointer', border: 'none' }}>
                  <Icon style={{ width: 14, height: 14, color: activeTab === id ? '#0C1B33' : '#4A5E7A', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: activeTab === id ? '#0C1B33' : '#9CA8BC' }}>{label}</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: activeTab === id ? '#4A3000' : '#2A3F5F', marginTop: 1 }}>{desc}</p>
                  </div>
                </button>
              ))}
            </nav>
          </div>
          <div style={{ padding: '16px 20px', borderTop: '1px solid #1E3A5F' }}>
            <div className="flex items-center justify-between">
              <StatusDot online={apiOnline} />
              <button onClick={doLogout} style={{ color: '#2A3F5F', background: 'none', border: 'none', cursor: 'pointer' }} className="hover:text-red-400 transition-colors">
                <LogOut style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'drafter'    && <DrafterAgent />}
          {activeTab === 'rag'        && <RAGAgent />}
          {activeTab === 'summarizer' && <SummarizerAgent />}
        </main>
      </div>
    );
  };

  // ── Drafter Agent ─────────────────────────────────────────────────────────────
  const DrafterAgent = () => {
    const [messages,    setMessages]    = useState([{ role: 'agent', text: 'Counsel, please provide the brief facts of the case — include the names of the parties, the police station or authority involved, and the nature of the detention or legal issue.' }]);
    const [input,       setInput]       = useState('');
    const [doc,         setDoc]         = useState('');
    const [loading,     setLoading]     = useState(false);
    const [pdfLoading,  setPdfLoading]  = useState(false);
    const [copied,      setCopied]      = useState(false);
    const [meta,        setMeta]        = useState(null);
    const [blockReason, setBlockReason] = useState('');
    const [warnings,    setWarnings]    = useState([]);
    const chatEnd = useRef(null);

    useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const addMsg    = (role, text) => setMessages(prev => [...prev, { role, text }]);
    const dropLastN = (n)          => setMessages(prev => prev.slice(0, prev.length - n));

    const handleSend = async () => {
      const story = input.trim();
      if (!story || loading) return;
      setBlockReason(''); setWarnings([]); setInput('');
      addMsg('user', story);
      setLoading(true);
      addMsg('agent', '⚙️ Classifying case type and detecting jurisdiction...');
      addMsg('agent', '📚 Retrieving relevant precedents from indexed judgments...');
      addMsg('agent', '✍️ Drafting petition with applicable legal strategy...');

      try {
        const data = await api.draft(story);
        if (data.status === 'blocked') {
          dropLastN(3);
          const reason = data.guardrail_blocked_reason || data.agent_reply || 'Your request was blocked.';
          setBlockReason(reason);
          addMsg('blocked', reason);
          return;
        }
        if (data.needs_info) {
          dropLastN(3);
          addMsg('agent', data.agent_reply || 'Please provide more details.');
          return;
        }
        if (data.status === 'error') {
          dropLastN(3);
          addMsg('agent', `⚠️ ${data.result || 'An error occurred.'}`);
          return;
        }
        if (data.result) {
          const w = data.guardrail_warnings || [];
          setWarnings(w);
          setDoc(data.result);
          setMeta({ type: data.petition_type, court: data.jurisdiction, primary: data.primary_citation, score: data.eval_overall_score, flags: data.red_flags || [] });
          dropLastN(3);
          addMsg('agent',
            `✅ ${data.petition_type || 'Petition'} drafted for ${data.jurisdiction || 'the court'}.\n` +
            `Primary citation: ${data.primary_citation || 'N/A'} · Score: ${(data.eval_overall_score || 0).toFixed(1)}/10` +
            (w.length > 0 ? `\n\n⚠️ ${w.length} notice${w.length > 1 ? 's' : ''} — review before filing.` : '') +
            `\n\nReview the document in the right panel and export as PDF.`
          );
        } else {
          dropLastN(3);
          addMsg('agent', '⚠️ No petition generated. Please try again with more detail.');
        }
      } catch {
        dropLastN(3);
        addMsg('agent', '❌ Network error. Please check the backend server.');
      } finally {
        setLoading(false);
      }
    };

    const handleDownloadPdf = async () => {
      if (!doc || pdfLoading) return;
      setPdfLoading(true);
      try {
        const url = await api.draftPdf(doc);
        const a = document.createElement('a');
        a.href = url; a.download = 'legal_petition.pdf'; a.click();
        URL.revokeObjectURL(url);
        addMsg('agent', '✅ Court-ready PDF downloaded. Review carefully before filing.');
      } catch (err) {
        addMsg('agent', `⚠️ PDF generation failed: ${err.message}`);
      } finally {
        setPdfLoading(false);
      }
    };

    return (
      <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 62px)' }}>
        {/* LEFT: Chat */}
        <div className="flex flex-col" style={{ width: '38%', minWidth: 300, background: '#040C1A', borderRight: '1px solid #1E3A5F' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #1E3A5F', background: 'rgba(38,83,168,0.1)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#B8960C,#D4AF37)' }} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield style={{ width: 14, height: 14, color: '#D4AF37' }} />
                <div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'white' }}>Agent Console</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: '#4A5E7A', marginTop: 1 }}>LangGraph Pipeline</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusDot online={apiOnline} />
                <button onClick={() => { setMessages([{ role: 'agent', text: 'Counsel, please describe the matter...' }]); setDoc(''); setMeta(null); setBlockReason(''); setWarnings([]); }} style={{ color: '#4A5E7A', background: 'none', border: 'none', cursor: 'pointer' }} className="hover:text-white transition-colors">
                  <RotateCcw style={{ width: 12, height: 12 }} />
                </button>
              </div>
            </div>
          </div>

          {meta && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #1E3A5F', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { label: meta.type, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
                { label: meta.court, color: '#D4AF37', bg: 'rgba(212,175,55,0.1)' },
                meta.score > 0 && { label: `${meta.score.toFixed(1)}/10`, color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
                meta.flags.length > 0 && { label: `⚠️ ${meta.flags.length} flag(s)`, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
              ].filter(Boolean).map((b, i) => (
                <span key={i} style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: b.color, background: b.bg, border: `1px solid ${b.color}30`, padding: '3px 7px' }}>{b.label}</span>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {(msg.role === 'agent' || msg.role === 'blocked') && (
                  <div style={{ width: 22, height: 22, flexShrink: 0, marginRight: 8, marginTop: 2, background: msg.role === 'blocked' ? '#7F1D1D' : '#0C1B33', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {msg.role === 'blocked' ? <AlertCircle style={{ width: 11, height: 11, color: '#FCA5A5' }} /> : <Scale style={{ width: 11, height: 11, color: '#D4AF37' }} />}
                  </div>
                )}
                <div style={{ maxWidth: '84%', padding: '10px 14px', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-line',
                  ...(msg.role === 'user'    ? { background: 'rgba(38,83,168,0.35)', color: 'white', border: '1px solid rgba(59,130,246,0.3)' } :
                      msg.role === 'blocked' ? { background: 'rgba(127,29,29,0.3)', color: '#FCA5A5', border: '1px solid rgba(220,38,38,0.4)', borderLeft: '3px solid #DC2626' } :
                                              { background: 'rgba(255,255,255,0.04)', color: '#CBD5E1', border: '1px solid rgba(255,255,255,0.06)' }) }}>
                  {msg.role === 'blocked' && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#EF4444', marginBottom: 6 }}>⛔ Request Blocked</div>}
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#4A5E7A' }}>
                <Loader2 style={{ width: 12, height: 12, color: '#D4AF37', animation: 'spin 1s linear infinite' }} />
                Agent processing — this may take 60–90 seconds...
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          <div style={{ padding: '12px 16px', borderTop: '1px solid #1E3A5F' }}>
            <div className="flex gap-2">
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Describe your case… (Enter to send)"
                rows={3} disabled={loading}
                style={{ flex: 1, padding: '10px 14px', resize: 'none', outline: 'none', background: 'rgba(255,255,255,0.04)', border: '1px solid #1E3A5F', color: 'white', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 14, lineHeight: 1.5 }}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()}
                style={{ padding: '0 14px', flexShrink: 0, background: loading || !input.trim() ? '#1E3A5F' : '#D4AF37', color: loading || !input.trim() ? '#4A5E7A' : '#0C1B33', border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {loading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Send style={{ width: 14, height: 14 }} />}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Document */}
        <div className="flex-1 flex flex-col" style={{ background: '#0A1628', overflow: 'hidden' }}>
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #1E3A5F', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="flex items-center gap-2" style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748B' }}>
              <FileText style={{ width: 13, height: 13, color: 'rgba(212,175,55,0.6)' }} />
              Petition Draft {doc && <span style={{ color: '#334155' }}>· {doc.length.toLocaleString()} chars</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { navigator.clipboard.writeText(doc); setCopied(true); setTimeout(() => setCopied(false), 2000); }} disabled={!doc}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748B', border: '1px solid #1E3A5F', padding: '6px 12px', background: 'transparent', opacity: doc ? 1 : 0.4, cursor: doc ? 'pointer' : 'not-allowed' }}>
                {copied ? <Check style={{ width: 10, height: 10, color: '#22C55E' }} /> : <Copy style={{ width: 10, height: 10 }} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => doc && downloadTxt(doc, 'petition_draft.txt')} disabled={!doc}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748B', border: '1px solid #1E3A5F', padding: '6px 12px', background: 'transparent', opacity: doc ? 1 : 0.4, cursor: doc ? 'pointer' : 'not-allowed' }}>
                <File style={{ width: 10, height: 10 }} /> .TXT
              </button>
              <button onClick={handleDownloadPdf} disabled={!doc || pdfLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 16px', background: doc && !pdfLoading ? '#D4AF37' : '#1E3A5F', color: doc && !pdfLoading ? '#0C1B33' : '#4A5E7A', border: 'none', cursor: doc && !pdfLoading ? 'pointer' : 'not-allowed' }}>
                {pdfLoading ? <><Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> Generating…</> : <><FileDown style={{ width: 10, height: 10 }} /> Export Court PDF</>}
              </button>
            </div>
          </div>

          {/* ── CONSISTENT GUARDRAIL BANNERS ── */}
          {blockReason && (
            <GuardrailBanner severity="block" message={blockReason} onDismiss={() => setBlockReason('')} />
          )}
          {warnings.length > 0 && doc && (
            <GuardrailBanner severity="warn" warnings={warnings} onDismiss={() => setWarnings([])} />
          )}

          <div className="flex-1 overflow-y-auto flex justify-center" style={{ padding: '28px 32px', background: '#0F1929' }}>
            <div style={{ width: '100%', maxWidth: 800, background: 'white', minHeight: 1123, padding: '72px 72px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {!doc ? (
                <div style={{ height: '100%', minHeight: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                  <div style={{ width: 48, height: 48, border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                    <FileText style={{ width: 22, height: 22, color: '#CBD5E1' }} />
                  </div>
                  <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, color: '#64748B', marginBottom: 8 }}>Court Petition Will Appear Here</p>
                  <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, color: '#94A3B8', textAlign: 'center', maxWidth: 340, lineHeight: 1.65 }}>
                    Describe your case in the Agent Console. The petition will appear here for review and editing.
                  </p>
                </div>
              ) : (
                <textarea value={doc} onChange={e => setDoc(e.target.value)}
                  style={{ width: '100%', resize: 'none', outline: 'none', color: '#1E293B', lineHeight: 1.85, background: 'transparent', fontFamily: "'Times New Roman', Georgia, serif", fontSize: '12pt', minHeight: 980, border: 'none' }}
                  spellCheck={false}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── RAG Agent  (Fix #2 — consistent guardrail banner) ─────────────────────────
  const RAGAgent = () => {
    const [query,       setQuery]       = useState('');
    const [result,      setResult]      = useState('');
    const [loading,     setLoading]     = useState(false);
    const [blockReason, setBlockReason] = useState('');   // ← unified
    const [warnings,    setWarnings]    = useState([]);   // ← unified
    const [history,     setHistory]     = useState([]);

    const search = async () => {
      if (!query.trim() || loading) return;
      setLoading(true); setBlockReason(''); setWarnings([]); setResult('');
      const q = query.trim();
      try {
        const data = await api.rag(q);

        if (data.status === 'blocked') {
          // Hard-blocked by guardrail — show the unified block banner
          setBlockReason(
            data.result ||
            data.guardrail_summary?.block_reason ||
            'This query cannot be processed. Please search for Pakistani legal cases or statutes.'
          );
          return;
        }

        if (data.status === 'ok') {
          setResult(data.result);
          setHistory(prev => [{ q, r: data.result, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
          // Surface soft warnings if any
          const w = data.guardrail_warnings || [];
          if (w.length > 0) setWarnings(w);
        } else {
          setBlockReason(data.result || 'Search failed. Please try again.');
        }
      } catch {
        setBlockReason('Network error. Ensure the backend is running.');
      } finally {
        setLoading(false);
      }
    };

    const EXAMPLES = [
      'Post-arrest bail in murder cases Section 302 PPC',
      'Habeas corpus illegal detention without warrant',
      'Article 199 quashment of FIR mala fide intent',
      'Cases by Justice Yahya Afridi 2023',
      'Pre-arrest bail extraordinary circumstances',
    ];

    return (
      <div className="flex-1 overflow-y-auto" style={{ background: '#07101F', padding: '40px 48px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid #1E3A5F' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 10 }}>
              Hybrid Semantic + BM25 Retrieval — 10,482 Judgments
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 30, fontWeight: 700, color: 'white' }}>
              Precedent Search Engine
            </h2>
          </div>

          <div className="flex gap-0 mb-4" style={{ border: '1px solid #1E3A5F', background: 'rgba(255,255,255,0.03)' }}>
            <div className="relative flex-1">
              <Search style={{ width: 14, height: 14, color: '#4A5E7A', position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Search judgments, cite sections, find cases by judge or party..."
                style={{ width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 14, paddingBottom: 14, outline: 'none', border: 'none', background: 'transparent', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 17, color: 'white' }} />
            </div>
            <button onClick={search} disabled={loading || !query.trim()}
              style={{ padding: '0 24px', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', background: loading || !query.trim() ? '#1E3A5F' : '#D4AF37', color: loading || !query.trim() ? '#4A5E7A' : '#0C1B33', border: 'none', cursor: loading || !query.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
              {loading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : 'Query'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-8">
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setQuery(ex)}
                style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4A5E7A', border: '1px solid #1E3A5F', padding: '5px 10px', background: 'transparent', cursor: 'pointer' }}
                className="hover:border-yellow-600 hover:text-yellow-400 transition-colors">
                {ex}
              </button>
            ))}
          </div>

          {/* ── CONSISTENT GUARDRAIL BANNERS ── */}
          {blockReason && (
            <div style={{ marginBottom: 20 }}>
              <GuardrailBanner severity="block" message={blockReason} onDismiss={() => setBlockReason('')} />
            </div>
          )}
          {warnings.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <GuardrailBanner severity="warn" warnings={warnings} onDismiss={() => setWarnings([])} />
            </div>
          )}

          {result && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1E3A5F', marginBottom: 28 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #1E3A5F', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(38,83,168,0.15)' }}>
                <div className="flex items-center gap-2">
                  <FileCheck2 style={{ width: 13, height: 13, color: '#D4AF37' }} />
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'white' }}>Search Results</span>
                </div>
                <button onClick={() => navigator.clipboard.writeText(result)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4A5E7A', background: 'none', border: 'none', cursor: 'pointer' }} className="hover:text-white transition-colors">
                  <Copy style={{ width: 10, height: 10 }} /> Copy
                </button>
              </div>
              <div style={{ padding: '24px 20px' }}>
                <pre style={{ fontFamily: "'DM Mono', 'Courier New', monospace", fontSize: 12, color: '#94A3B8', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{result}</pre>
              </div>
            </div>
          )}

          {!result && !blockReason && !loading && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1E3A5F', padding: '60px 24px', textAlign: 'center' }}>
              <BookOpen style={{ width: 28, height: 28, color: '#1E3A5F', margin: '0 auto 12px' }} />
              <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: '#4A5E7A', marginBottom: 6 }}>Database Ready</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1E3A5F' }}>10,482 Judgments Indexed — Awaiting Query</p>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#1E3A5F', marginBottom: 8 }}>Recent Queries</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {history.map((h, i) => (
                  <div key={i} onClick={() => { setQuery(h.q); setResult(h.r); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid #1E3A5F', cursor: 'pointer' }}
                    className="hover:bg-white/5 transition-colors">
                    <Search style={{ width: 11, height: 11, color: '#1E3A5F', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.q}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: '#1E3A5F', flexShrink: 0 }}>{h.ts}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Summarizer Agent  (Fix #2 — consistent guardrail banner) ──────────────────
  const SummarizerAgent = () => {
    const [file,        setFile]        = useState(null);
    const [result,      setResult]      = useState('');
    const [loading,     setLoading]     = useState(false);
    const [blockReason, setBlockReason] = useState('');   // ← unified
    const [warnings,    setWarnings]    = useState([]);   // ← unified
    const [dragOver,    setDragOver]    = useState(false);
    const fileRef = useRef(null);

    const handleFile = (f) => {
      if (!f) return;
      const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/png', 'image/jpeg'];
      if (!allowed.includes(f.type)) { setBlockReason('Unsupported file type. Upload PDF, DOCX, TXT, PNG, or JPG.'); return; }
      setFile(f); setBlockReason('');
    };

    const submit = async () => {
      if (!file || loading) return;
      setLoading(true); setBlockReason(''); setWarnings([]); setResult('');
      try {
        const data = await api.summarize(file);

        if (data.status === 'blocked') {
          setBlockReason(data.guardrail_blocked_reason || 'This document cannot be processed.');
          return;
        }
        if (data.status === 'ok') {
          setResult(data.result);
        } else {
          setBlockReason(data.result || 'Summarization failed.');
        }
      } catch {
        setBlockReason('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="flex-1 overflow-y-auto" style={{ background: '#07101F', padding: '40px 48px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid #1E3A5F' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 10 }}>
              AI Extraction — Facts · Issues · Holding · Ratio Decidendi
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 30, fontWeight: 700, color: 'white' }}>
              Case File Briefing
            </h2>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1E3A5F', marginBottom: 20 }}>
            <div
              style={{ padding: '48px 32px', border: `2px dashed ${dragOver ? '#D4AF37' : '#1E3A5F'}`, margin: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: dragOver ? 'rgba(212,175,55,0.05)' : 'transparent', transition: 'all 0.15s' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={e => handleFile(e.target.files[0])} />
              <UploadCloud style={{ width: 28, height: 28, color: file ? '#D4AF37' : '#1E3A5F', marginBottom: 14 }} />
              {file ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, color: '#D4AF37', marginBottom: 4 }}>{file.name}</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4A5E7A' }}>{(file.size / 1024).toFixed(1)} KB — Ready</p>
                  <button onClick={e => { e.stopPropagation(); setFile(null); }} style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: '#EF4444', marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, margin: '10px auto 0', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X style={{ width: 10, height: 10 }} /> Remove
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: '#64748B', marginBottom: 6 }}>Drop document here</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1E3A5F', marginBottom: 14 }}>PDF, DOCX, TXT, PNG, JPG — up to 25 MB</p>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', border: '1px solid #1E3A5F', padding: '8px 16px', color: '#4A5E7A', display: 'inline-block' }}>Browse Files</div>
                </div>
              )}
            </div>

            <div style={{ padding: '0 20px 20px' }}>
              <button onClick={submit} disabled={!file || loading}
                style={{ width: '100%', padding: '13px 0', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', background: !file || loading ? '#1E3A5F' : '#D4AF37', color: !file || loading ? '#4A5E7A' : '#0C1B33', border: 'none', cursor: !file || loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? <><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Analysing — may take 60–90 seconds…</> : 'Generate Executive Legal Brief'}
              </button>
            </div>
          </div>

          {/* ── CONSISTENT GUARDRAIL BANNERS ── */}
          {blockReason && (
            <div style={{ marginBottom: 20 }}>
              <GuardrailBanner severity="block" message={blockReason} onDismiss={() => setBlockReason('')} />
            </div>
          )}
          {warnings.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <GuardrailBanner severity="warn" warnings={warnings} onDismiss={() => setWarnings([])} />
            </div>
          )}

          {result && (
            <div style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', minHeight: 1123, padding: '72px 72px' }}>
              <div className="flex items-start justify-between mb-6">
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#64748B' }}>Legal Memo</span>
                <button onClick={() => downloadTxt(result, 'legal_memo.txt')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }} className="hover:text-slate-600 transition-colors">
                  <Download style={{ width: 10, height: 10 }} /> Download .TXT
                </button>
              </div>
              <pre style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '12pt', color: '#1E293B', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>{result}</pre>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Router ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#040C1A', color: '#CBD5E1' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        button { cursor: pointer; }
        input, textarea { color-scheme: dark; }
        ::selection { background: #0C1B33; color: white; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #040C1A; }
        ::-webkit-scrollbar-thumb { background: #1E3A5F; }
        ::-webkit-scrollbar-thumb:hover { background: #B8960C; }
      `}</style>
      <Navbar />
      {page === 'landing'   && <LandingPage />}
      {page === 'pricing'   && <PricingPage />}
      {page === 'login'     && <AuthPage type="login" />}
      {page === 'signup'    && <AuthPage type="signup" />}
      {page === 'workspace' && <Workspace />}
    </div>
  );
}
