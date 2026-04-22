import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Scale, FileText, Search, Shield, UploadCloud, Download, Edit3,
  LogOut, File, BookOpen, Gavel, ArrowRight, FileCheck2,
  Loader2, AlertCircle, X, Menu, ScrollText, Send,
  Copy, Check, Brain, Database, FileDown, Clock, Plus,
  ChevronDown, ChevronRight,
} from 'lucide-react';

// ─── API layer ────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL || '';

const api = {
  setToken(t)  { localStorage.setItem('ls_token', t); },
  getToken()   { return localStorage.getItem('ls_token'); },
  clearToken() { localStorage.removeItem('ls_token'); },
  getAuthHeaders() {
    const t = this.getToken();
    return { Authorization: t ? `Bearer ${t}` : '' };
  },
  async login(email, password) {
    const form = new FormData();
    form.append('email', email); form.append('password', password);
    const res = await fetch(`${API_BASE}/auth/login`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.status === 'ok') this.setToken(data.access_token);
    return data;
  },
  async signup(email, password, fullName) {
    const form = new FormData();
    form.append('email', email); form.append('password', password); form.append('full_name', fullName);
    const res = await fetch(`${API_BASE}/auth/signup`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.status === 'ok') this.setToken(data.access_token);
    return data;
  },
  async verifyToken() {
    const res = await fetch(`${API_BASE}/auth/verify`, { headers: this.getAuthHeaders() });
    return res.json();
  },
  async draft(story) {
    const form = new FormData();
    form.append('story', story); form.append('user_id', 'web_user');
    const res = await fetch(`${API_BASE}/draft`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async rag(query) {
    const form = new FormData();
    form.append('query', query);
    const res = await fetch(`${API_BASE}/rag`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async summarize(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/summarize`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async draftPdf(petitionText) {
    const form = new FormData();
    form.append('petition_text', petitionText);
    const res = await fetch(`${API_BASE}/draft/pdf`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    if (!res.ok) throw new Error(`PDF error ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  async health() {
    try { return (await fetch(`${API_BASE}/health`)).ok; } catch { return false; }
  },
  // ── Session persistence (Postgres) ───────────────────────────────────────
  async getSessions() {
    const res = await fetch(`${API_BASE}/sessions`, { headers: this.getAuthHeaders() });
    return res.json();
  },
  async createSession(feature, label, data) {
    const form = new FormData();
    form.append('feature', feature);
    form.append('label', label);
    form.append('data', JSON.stringify(data));
    const res = await fetch(`${API_BASE}/sessions`, { method: 'POST', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async updateSession(id, changes) {
    const form = new FormData();
    if (changes.label !== undefined) form.append('label', changes.label);
    if (changes.data  !== undefined) form.append('data',  JSON.stringify(changes.data));
    const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'PATCH', body: form, headers: this.getAuthHeaders() });
    return res.json();
  },
  async deleteSession(id) {
    const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE', headers: this.getAuthHeaders() });
    return res.json();
  },
};

function downloadTxt(text, filename = 'petition.txt') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = filename; a.click();
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Guardrail Banner ─────────────────────────────────────────────────────────
function GuardrailBanner({ severity, message, warnings = [], onDismiss }) {
  if (!message && warnings.length === 0) return null;
  const isBlock = severity === 'block';
  return (
    <div style={{
      padding: '12px 16px', marginBottom: 16,
      borderLeft: `3px solid ${isBlock ? '#DC2626' : '#B8960C'}`,
      background: isBlock ? '#FEF2F2' : '#FFFBEB',
    }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: isBlock ? '#DC2626' : '#B8960C', marginBottom: 4 }}>
        {isBlock ? '⛔ Request Blocked' : `⚠ ${warnings.length} Notice${warnings.length !== 1 ? 's' : ''}`}
      </div>
      {message && <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: isBlock ? '#7F1D1D' : '#78350F', lineHeight: 1.6 }}>{message}</p>}
      {warnings.map((w, i) => <p key={i} style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#78350F', lineHeight: 1.6 }}>— {w}</p>)}
      {onDismiss && <button onClick={onDismiss} style={{ marginTop: 6, fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.1em', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer' }}>Dismiss</button>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]           = useState('landing');
  const [user, setUser]           = useState(null);
  const [activeFeature, setFeat]  = useState('drafter');
  const [apiOnline, setOnline]    = useState(null);
  const [mobileOpen, setMobile]   = useState(false);

  // All history lives in Postgres — these are just local cache arrays
  const [drafterHistory, setDrafterHistory] = useState([]);
  const [ragHistory,     setRagHistory]     = useState([]);
  const [summaryHistory, setSummaryHistory] = useState([]);

  // Active session pointer — null means new session
  const [activeDraftSession,   setActiveDraftSession]   = useState(null);
  const [activeRagSession,     setActiveRagSession]     = useState(null);
  const [activeSummarySession, setActiveSummarySession] = useState(null);

  // Load sessions from API and split into feature buckets
  const loadSessions = async () => {
    try {
      const r = await api.getSessions();
      if (r.status !== 'ok') return;
      const sessions = r.sessions.map(s => ({
        ...s,
        ...s.data,       // spread data fields to top level for convenience
        ts: new Date(s.created_at).getTime(),
      }));
      setDrafterHistory(sessions.filter(s => s.feature === 'drafter'));
      setRagHistory(    sessions.filter(s => s.feature === 'rag'));
      setSummaryHistory(sessions.filter(s => s.feature === 'summarizer'));
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

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

  const nav = useCallback((p) => { setPage(p); setMobile(false); window.scrollTo(0, 0); }, []);

  const doLogin = async (u) => {
    setUser(u);
    await loadSessions();
    nav('workspace');
  };
  const doLogout = () => {
    api.clearToken();
    setUser(null);
    setDrafterHistory([]); setRagHistory([]); setSummaryHistory([]);
    setActiveDraftSession(null); setActiveRagSession(null); setActiveSummarySession(null);
    nav('landing');
  };

  // ── Shared Navbar ────────────────────────────────────────────────────────────
  const Navbar = () => (
    <nav style={{ background: '#0B1929', borderBottom: '1px solid #1a2e45', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg,#B8960C,#D4AF37,#B8960C)' }} />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <button onClick={() => nav('landing')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }}>
          <Scale style={{ width: 18, height: 18, color: '#D4AF37' }} />
          <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 17, fontWeight: 700, color: 'white' }}>Legal Sahara</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.12em', color: apiOnline ? '#34D399' : '#F87171', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: apiOnline ? '#34D399' : '#F87171', display: 'inline-block' }} />
            {apiOnline ? 'Online' : 'Offline'}
          </span>
          {user ? (
            <>
              <button onClick={() => nav('workspace')} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#D4AF37', background: 'none', border: 'none', cursor: 'pointer' }}>Workspace</button>
              <button onClick={doLogout} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B7F9E', background: 'none', border: 'none', cursor: 'pointer' }}>
                <LogOut style={{ width: 13, height: 13 }} /> Sign out
              </button>
            </>
          ) : (
            <>
              <button onClick={() => nav('login')} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9CA8BC', background: 'none', border: 'none', cursor: 'pointer' }}>Login</button>
              <button onClick={() => nav('signup')} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', background: '#D4AF37', color: '#0B1929', padding: '8px 16px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Apply</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );

  // ── Landing Page ─────────────────────────────────────────────────────────────
  const LandingPage = () => (
    <div style={{ background: '#F7F4EF', minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 32px 120px' }}>
        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 24 }}>Pakistan's First Agentic Legal AI</p>
        <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(40px,6vw,68px)', fontWeight: 700, color: '#0B1929', lineHeight: 1.1, marginBottom: 20 }}>
          The Standard for<br/><em style={{ fontStyle: 'italic', color: '#B8960C' }}>Legal Intelligence</em><br/>in Pakistan.
        </h1>
        <div style={{ width: 40, height: 2, background: '#0B1929', marginBottom: 24 }} />
        <p style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#4A4035', lineHeight: 1.8, maxWidth: 560, marginBottom: 40 }}>
          Empowering High Court and Supreme Court advocates with agentic AI. Research PLD &amp; SCMR precedents, brief voluminous case files, and draft court-ready petitions.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => user ? nav('workspace') : nav('login')} style={{ background: '#0B1929', color: 'white', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 28px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {user ? 'Open Workspace' : 'Access Workspace'} <ArrowRight style={{ width: 13, height: 13 }} />
          </button>
          <button onClick={() => nav('pricing')} style={{ background: 'transparent', color: '#0B1929', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 28px', border: '1px solid rgba(11,25,41,0.3)', cursor: 'pointer' }}>View Retainers</button>
        </div>
      </div>

      <div style={{ background: '#0B1929', padding: '0' }}>
        <div style={{ height: 2, background: 'linear-gradient(90deg,#B8960C,#D4AF37,#B8960C)' }} />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid #1a2e45' }}>
          {[['10,482+','Judgments Indexed'],['5','Petition Formats'],['PLD/SCMR','Citation Authority'],['<90s','Avg Draft Time']].map(([n,l],i) => (
            <div key={i} style={{ padding: '32px 0', borderRight: i<3?'1px solid #1a2e45':'none' }}>
              <div style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 28, fontWeight: 700, color: 'white', marginBottom: 6 }}>{n}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4A5E7A' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 32px' }}>
        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 48 }}>Three tools. One platform.</p>
        {[
          { icon: BookOpen, title: 'Precedent Research', desc: 'Hybrid semantic and BM25 search across 10,000+ indexed judgments. Retrieve ratio decidendi with verified citation authority — PLD, SCMR, YLR ranked by binding force.' },
          { icon: FileCheck2, title: 'Case File Briefing', desc: 'Upload FIRs, charge sheets, or lower court orders. Receive a structured legal memo covering facts, issues, holding, and ratio decidendi.' },
          { icon: Gavel, title: 'Petition Drafting', desc: 'Classifies your matter, detects red flags, retrieves precedents, and formats all five petition types. Exports a court-ready PDF.' },
        ].map(({ icon: Icon, title, desc }, i) => (
          <div key={i} style={{ display: 'flex', gap: 32, paddingTop: 40, paddingBottom: 40, borderTop: '1px solid #E8E4DC', alignItems: 'flex-start' }}>
            <Icon style={{ width: 20, height: 20, color: '#B8960C', flexShrink: 0, marginTop: 4 }} />
            <div>
              <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 20, fontWeight: 700, color: '#0B1929', marginBottom: 10 }}>{title}</h3>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: 16, color: '#4A4035', lineHeight: 1.75 }}>{desc}</p>
            </div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #E8E4DC' }} />
      </div>

      <div style={{ background: '#0B1929', padding: '8px 0' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#4A5E7A' }}>Not a substitute for qualified legal advice.</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#2A3F5F', letterSpacing: '0.1em' }}>© 2026 LEGAL SAHARA</span>
        </div>
      </div>
    </div>
  );

  // ── Pricing ───────────────────────────────────────────────────────────────────
  const PricingPage = () => (
    <div style={{ background: '#F7F4EF', minHeight: '90vh', padding: '64px 32px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 16 }}>Transparent Licensing</p>
        <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 38, fontWeight: 700, color: '#0B1929', marginBottom: 48, paddingBottom: 24, borderBottom: '1px solid #E8E4DC' }}>Software Retainers</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '1px solid #E8E4DC' }}>
          {[
            { name: 'Academic', price: '0', features: ['5 Queries/month','Standard Drafting','Basic Summarization'], cta: 'Get Started' },
            { name: 'Advocate Pro', price: '2,500', features: ['250 Queries/month','PDF Briefing Engine','Court-Ready PDF Export','Priority Processing'], cta: 'Select Pro', hi: true },
            { name: 'Chamber', price: '10,000', features: ['Unlimited Usage','Custom Precedents','5 Users','Dedicated Support'], cta: 'Contact Us' },
          ].map((p,i) => (
            <div key={i} style={{ padding: '36px 28px', borderRight: i<2?'1px solid #E8E4DC':'none', background: p.hi?'#0B1929':'white', position:'relative' }}>
              {p.hi && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#B8960C,#D4AF37)' }} />}
              <h3 style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:20, fontWeight:700, color:p.hi?'white':'#0B1929', marginBottom:8 }}>{p.name}</h3>
              <div style={{ marginBottom:20, paddingBottom:20, borderBottom:`1px solid ${p.hi?'#1a2e45':'#E8E4DC'}` }}>
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:11, color:p.hi?'#6B7F9E':'#9CA8BC' }}>Rs. </span>
                <span style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:36, fontWeight:700, color:p.hi?'white':'#0B1929' }}>{p.price}</span>
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:p.hi?'#4A5E7A':'#B8B0A0', marginLeft:4 }}>/mo</span>
              </div>
              {p.features.map((f,j)=><p key={j} style={{ fontFamily:'Georgia,serif', fontSize:15, color:p.hi?'#C8D4E0':'#3D3D3D', marginBottom:10, lineHeight:1.5 }}>— {f}</p>)}
              <button onClick={()=>nav('signup')} style={{ marginTop:20, width:'100%', padding:'11px 0', fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', background:p.hi?'#D4AF37':'#0B1929', color:p.hi?'#0B1929':'white', border:'none', cursor:'pointer' }}>{p.cta}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Auth Page ─────────────────────────────────────────────────────────────────
  const AuthPage = ({ type }) => {
    const [email, setEmail]     = useState('');
    const [pass, setPass]       = useState('');
    const [name, setName]       = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');

    const handle = async () => {
      if (!email || !pass || (type==='signup'&&!name)) { setError('Fill in all fields.'); return; }
      setLoading(true); setError('');
      try {
        const r = type==='login' ? await api.login(email, pass) : await api.signup(email, pass, name);
        if (r.status==='ok') doLogin(r.user);
        else setError(r.message || 'Authentication failed.');
      } catch { setError('Network error.'); }
      finally { setLoading(false); }
    };

    const inp = { width:'100%', padding:'11px 0', fontFamily:'Georgia,serif', fontSize:16, color:'#0B1929', background:'transparent', border:'none', borderBottom:'1px solid #D9D4C8', outline:'none', marginBottom:24 };

    return (
      <div style={{ background:'#F7F4EF', minHeight:'90vh', display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <Scale style={{ width:22, height:22, color:'#B8960C', margin:'0 auto 12px' }} />
            <h2 style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:26, fontWeight:700, color:'#0B1929' }}>{type==='login'?'Sign In':'Create Account'}</h2>
          </div>
          {error && <div style={{ background:'#FEF2F2', borderLeft:'3px solid #DC2626', padding:'10px 14px', marginBottom:20, fontFamily:'Georgia,serif', fontSize:14, color:'#7F1D1D' }}>{error}</div>}
          {type==='signup' && <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" style={inp} />}
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" style={inp} onKeyDown={e=>e.key==='Enter'&&handle()} />
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password" style={inp} onKeyDown={e=>e.key==='Enter'&&handle()} />
          {type==='login' && (
            <div style={{ background:'rgba(184,150,12,0.08)', borderLeft:'2px solid #B8960C', padding:'8px 12px', marginBottom:20, fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.1em', color:'#78350F' }}>
              DEMO &nbsp;·&nbsp; advocate@legal-sahara.com &nbsp;/&nbsp; demo123
            </div>
          )}
          <button onClick={handle} disabled={loading} style={{ width:'100%', padding:'13px 0', background:'#0B1929', color:'white', fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', border:'none', cursor:'pointer', opacity:loading?.7:1 }}>
            {loading ? 'Processing…' : type==='login' ? 'Sign In' : 'Create Account'}
          </button>
          <p style={{ fontFamily:'Georgia,serif', fontSize:15, color:'#6B6B6B', textAlign:'center', marginTop:20 }}>
            {type==='login'?'No account? ':'Have access? '}
            <button onClick={()=>nav(type==='login'?'signup':'login')} style={{ color:'#0B1929', fontWeight:700, textDecoration:'underline', background:'none', border:'none', cursor:'pointer' }}>
              {type==='login'?'Register':'Sign in'}
            </button>
          </p>
        </div>
      </div>
    );
  };

  // ── Workspace ─────────────────────────────────────────────────────────────────
  const Workspace = () => {
    const features = [
      { id:'drafter',    icon:Edit3,    label:'Petition Drafter' },
      { id:'rag',        icon:Database, label:'Precedent Search' },
      { id:'summarizer', icon:Brain,    label:'Case Briefing' },
    ];

    return (
      <div style={{ display:'flex', minHeight:'calc(100vh - 58px)', background:'#F7F4EF' }}>
        {/* Sidebar */}
        <aside style={{ width:260, flexShrink:0, background:'white', borderRight:'1px solid #E8E4DC', display:'flex', flexDirection:'column', overflowY:'auto' }}>
          {/* User */}
          <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid #E8E4DC' }}>
            <p style={{ fontFamily:'DM Mono,monospace', fontSize:8, letterSpacing:'0.15em', textTransform:'uppercase', color:'#B8B0A0', marginBottom:4 }}>Signed in as</p>
            <p style={{ fontFamily:'Georgia,serif', fontSize:15, color:'#0B1929', fontWeight:500 }}>{user?.full_name || 'Advocate'}</p>
            <p style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#B8960C', letterSpacing:'0.08em' }}>{user?.license_type || 'Free'}</p>
          </div>

          {/* Feature tabs */}
          <div style={{ padding:'12px 8px', borderBottom:'1px solid #E8E4DC' }}>
            {features.map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setFeat(id)}
                style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 12px', background:activeFeature===id?'#0B1929':'transparent', border:'none', cursor:'pointer', textAlign:'left', marginBottom:2 }}>
                <Icon style={{ width:14, height:14, color:activeFeature===id?'#D4AF37':'#9CA8BC', flexShrink:0 }} />
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:'0.05em', color:activeFeature===id?'white':'#6B6B6B' }}>{label}</span>
              </button>
            ))}
          </div>

          {/* History */}
          <div style={{ flex:1, padding:'12px 8px', overflowY:'auto' }}>
            <p style={{ fontFamily:'DM Mono,monospace', fontSize:8, letterSpacing:'0.15em', textTransform:'uppercase', color:'#B8B0A0', padding:'4px 12px', marginBottom:8 }}>History</p>
            {activeFeature === 'drafter' && (
              <>
                {drafterHistory.length === 0
                  ? <p style={{ fontFamily:'Georgia,serif', fontSize:13, color:'#B8B0A0', padding:'4px 12px', fontStyle:'italic' }}>No sessions yet</p>
                  : drafterHistory.slice().reverse().map(s => (
                    <button key={s.id} onClick={() => setActiveDraftSession(s)}
                      style={{ display:'flex', alignItems:'flex-start', gap:8, width:'100%', padding:'10px 12px', background:activeDraftSession?.id===s.id?'#F7F4EF':'transparent', border:'none', cursor:'pointer', textAlign:'left', marginBottom:2 }}>
                      <Clock style={{ width:11, height:11, color:'#B8B0A0', flexShrink:0, marginTop:2 }} />
                      <div>
                        <p style={{ fontFamily:'Georgia,serif', fontSize:13, color:'#0B1929', marginBottom:2 }}>{s.label}</p>
                        <p style={{ fontFamily:'DM Mono,monospace', fontSize:8, color:'#B8B0A0', letterSpacing:'0.06em' }}>{formatTime(s.ts)}</p>
                      </div>
                    </button>
                  ))
                }
              </>
            )}
            {activeFeature === 'rag' && (
              <>
                {ragHistory.length === 0
                  ? <p style={{ fontFamily:'Georgia,serif', fontSize:13, color:'#B8B0A0', padding:'4px 12px', fontStyle:'italic' }}>No searches yet</p>
                  : ragHistory.slice().reverse().map(s => (
                    <button key={s.id} onClick={() => setActiveRagSession(s)}
                      style={{ display:'flex', alignItems:'flex-start', gap:8, width:'100%', padding:'10px 12px', background:activeRagSession?.id===s.id?'#F7F4EF':'transparent', border:'none', cursor:'pointer', textAlign:'left', marginBottom:2 }}>
                      <Clock style={{ width:11, height:11, color:'#B8B0A0', flexShrink:0, marginTop:2 }} />
                      <div>
                        <p style={{ fontFamily:'Georgia,serif', fontSize:13, color:'#0B1929', marginBottom:2 }}>{s.query.slice(0,50)}{s.query.length>50?'…':''}</p>
                        <p style={{ fontFamily:'DM Mono,monospace', fontSize:8, color:'#B8B0A0', letterSpacing:'0.06em' }}>{formatTime(s.ts)}</p>
                      </div>
                    </button>
                  ))
                }
              </>
            )}
            {activeFeature === 'summarizer' && (
              <>
                {summaryHistory.length === 0
                  ? <p style={{ fontFamily:'Georgia,serif', fontSize:13, color:'#B8B0A0', padding:'4px 12px', fontStyle:'italic' }}>No documents yet</p>
                  : summaryHistory.slice().reverse().map(s => (
                    <button key={s.id} onClick={() => setActiveSummarySession(s)}
                      style={{ display:'flex', alignItems:'flex-start', gap:8, width:'100%', padding:'10px 12px', background:activeSummarySession?.id===s.id?'#F7F4EF':'transparent', border:'none', cursor:'pointer', textAlign:'left', marginBottom:2 }}>
                      <Clock style={{ width:11, height:11, color:'#B8B0A0', flexShrink:0, marginTop:2 }} />
                      <div>
                        <p style={{ fontFamily:'Georgia,serif', fontSize:13, color:'#0B1929', marginBottom:2 }}>{s.filename}</p>
                        <p style={{ fontFamily:'DM Mono,monospace', fontSize:8, color:'#B8B0A0', letterSpacing:'0.06em' }}>{formatTime(s.ts)}</p>
                      </div>
                    </button>
                  ))
                }
              </>
            )}
          </div>

          {/* New session button */}
          <div style={{ padding:12, borderTop:'1px solid #E8E4DC' }}>
            <button
              onClick={() => {
                if (activeFeature==='drafter') setActiveDraftSession(null);
                if (activeFeature==='rag') setActiveRagSession(null);
                if (activeFeature==='summarizer') setActiveSummarySession(null);
              }}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'10px 12px', background:'#F7F4EF', border:'1px solid #E8E4DC', cursor:'pointer' }}>
              <Plus style={{ width:13, height:13, color:'#B8960C' }} />
              <span style={{ fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'#4A4035' }}>New Session</span>
            </button>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {activeFeature==='drafter'    && <DrafterPanel
            key={activeDraftSession?.id || 'new'}
            session={activeDraftSession}
            onSave={async (s) => {
              // s already has the db id from createSession
              setDrafterHistory(h => [...h, s]);
              setActiveDraftSession(s);
            }}
            onUpdate={async (id, changes) => {
              setDrafterHistory(h => h.map(s => s.id===id ? {...s, ...changes} : s));
              // persist to Postgres — changes.data contains the full data blob
              try { await api.updateSession(id, { data: changes }); } catch {}
            }}
          />}
          {activeFeature==='rag'        && <RAGPanel
            key={activeRagSession?.id||'rag'}
            session={activeRagSession}
            onSave={(s) => { setRagHistory(h=>[...h,s]); setActiveRagSession(s); }}
          />}
          {activeFeature==='summarizer' && <SummaryPanel
            key={activeSummarySession?.id||'sum'}
            session={activeSummarySession}
            onSave={(s) => { setSummaryHistory(h=>[...h,s]); setActiveSummarySession(s); }}
          />}
        </main>
      </div>
    );
  };

  // ── Drafter Panel ─────────────────────────────────────────────────────────────
  // session prop: null = new session, object = resume/edit existing session
  const DrafterPanel = ({ session, onSave, onUpdate }) => {
    // Initialise from session if provided, otherwise blank
    const [messages,   setMessages]  = useState(session?.messages || [{ role:'agent', text:'Counsel, please describe the matter — include the names of the parties, the police station or authority involved, and the nature of the legal issue.' }]);
    const [input,      setInput]     = useState('');
    const [doc,        setDoc]       = useState(session?.doc || '');
    const [loading,    setLoading]   = useState(false);
    const [pdfLoading, setPdfLoad]   = useState(false);
    const [copied,     setCopied]    = useState(false);
    const [meta,       setMeta]      = useState(session?.meta || null);
    const [blockReason, setBlock]    = useState('');
    const [warnings,   setWarnings]  = useState([]);
    const sessionId = useRef(session?.id || null);
    const chatEnd   = useRef(null);

    useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

    const debounceRef = useRef(null);

    // Keep doc in sync when user edits textarea (for ongoing session)
    const handleDocChange = (val) => {
      setDoc(val);
      if (sessionId.current) {
        // Debounce — only write to Postgres 1.5s after user stops typing
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          onUpdate(sessionId.current, { doc: val });
        }, 1500);
      }
    };

    const addMsg    = (role, text) => setMessages(p => [...p, { role, text }]);
    const dropLast3 = ()           => setMessages(p => p.slice(0, p.length - 3));

    const handleSend = async () => {
      const story = input.trim();
      if (!story || loading) return;
      setBlock(''); setWarnings([]); setInput('');
      const newUserMsg = { role:'user', text:story };
      setMessages(p => [...p, newUserMsg]);
      setLoading(true);
      addMsg('agent', 'Classifying case type and jurisdiction…');
      addMsg('agent', 'Retrieving precedents from indexed judgments…');
      addMsg('agent', 'Drafting petition with legal strategy…');
      try {
        const data = await api.draft(story);
        if (data.status === 'blocked') {
          const r = data.agent_reply || data.guardrail_summary?.block_reason || 'Request blocked.';
          dropLast3(); setBlock(r); addMsg('blocked', r); return;
        }
        if (data.needs_info) { dropLast3(); addMsg('agent', data.agent_reply || 'Please provide more details.'); return; }
        if (data.status === 'error') { dropLast3(); addMsg('agent', `⚠ ${data.result}`); return; }
        if (data.result) {
          const w = data.guardrail_warnings || [];
          setWarnings(w); setDoc(data.result);
          const m = { type:data.petition_type, court:data.jurisdiction, primary:data.primary_citation, score:data.eval_overall_score, flags:data.red_flags||[] };
          setMeta(m);
          dropLast3();
          const successMsg = `${data.petition_type || 'Petition'} drafted for ${data.jurisdiction || 'the court'}.\nCitation: ${data.primary_citation || 'N/A'} · Score: ${(data.eval_overall_score||0).toFixed(1)}/10${w.length?`\n\n${w.length} notice(s) — review before filing.`:''}\n\nReview the draft on the right, then export as PDF.`;
          const successMsgObj = { role:'agent', text:successMsg };
          setMessages(p => [...p, successMsgObj]);

          if (sessionId.current) {
            // Update existing session in Postgres
            const allMessages = [...messages, newUserMsg, successMsgObj];
            const updatedData = { messages: allMessages, doc: data.result, meta: m };
            onUpdate(sessionId.current, updatedData);
          } else {
            // Create new session in Postgres
            const allMessages = [...messages, newUserMsg, successMsgObj];
            const sessionData = {
              messages: allMessages.map(msg => ({ role: msg.role, text: msg.text })),
              doc: data.result,
              meta: {
                type:    m.type    || '',
                court:   m.court   || '',
                primary: m.primary || '',
                score:   m.score   || 0,
                flags:   m.flags   || [],
              },
            };
            const label = `${data.petition_type || 'Petition'} — ${story.slice(0, 40)}`;
            try {
              const created = await api.createSession('drafter', label, sessionData);
              console.log('Session create response:', created);
              if (created.status === 'ok') {
                sessionId.current = created.id;
                const saved = {
                  id:      created.id,
                  feature: 'drafter',
                  label,
                  ts:      new Date(created.created_at).getTime(),
                  ...sessionData,
                };
                onSave(saved);
              }
            } catch (e) {
              console.error('Failed to save drafter session:', e);
            }
          }
        } else { dropLast3(); addMsg('agent', '⚠ No petition generated. Try again with more detail.'); }
      } catch { dropLast3(); addMsg('agent', '❌ Network error. Check backend.'); }
      finally { setLoading(false); }
    };

    const handlePdf = async () => {
      if (!doc || pdfLoading) return;
      setPdfLoad(true);
      try {
        const url = await api.draftPdf(doc);
        const a = document.createElement('a'); a.href=url; a.download='legal_petition.pdf'; a.click();
        URL.revokeObjectURL(url);
        addMsg('agent', '✅ PDF downloaded. Review carefully before filing.');
      } catch (e) { addMsg('agent', `⚠ PDF failed: ${e.message}`); }
      finally { setPdfLoad(false); }
    };

    return (
      <div style={{ flex:1, display:'flex', overflow:'hidden', height:'calc(100vh - 58px)' }}>
        {/* Chat */}
        <div style={{ width:'40%', minWidth:300, display:'flex', flexDirection:'column', borderRight:'1px solid #E8E4DC', background:'white' }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #E8E4DC', background:'#0B1929', position:'relative' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#B8960C,#D4AF37)' }} />
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Shield style={{ width:14, height:14, color:'#D4AF37' }} />
              <div>
                <p style={{ fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'white' }}>Agent Console</p>
                <p style={{ fontFamily:'DM Mono,monospace', fontSize:8, color:'#4A5E7A', marginTop:1 }}>LangGraph Agentic Pipeline</p>
              </div>
            </div>
          </div>
          {meta && (
            <div style={{ padding:'8px 16px', borderBottom:'1px solid #E8E4DC', display:'flex', flexWrap:'wrap', gap:6, background:'#FAFAF8' }}>
              {[{l:meta.type,c:'#0B1929',b:'#EEF1F7'},{l:meta.court,c:'#6B4A00',b:'#FDF5DC'}, meta.score>0&&{l:`${meta.score.toFixed(1)}/10`,c:'#1A5C2A',b:'#F0FDF4'}, meta.flags?.length>0&&{l:`${meta.flags.length} flag(s)`,c:'#7F1D1D',b:'#FEF2F2'}].filter(Boolean).map((b,i)=>(
                <span key={i} style={{ fontFamily:'DM Mono,monospace', fontSize:8, letterSpacing:'0.1em', textTransform:'uppercase', color:b.c, background:b.b, border:`1px solid ${b.c}25`, padding:'3px 7px' }}>{b.l}</span>
              ))}
            </div>
          )}
          <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display:'flex', justifyContent:msg.role==='user'?'flex-end':'flex-start' }}>
                {msg.role!=='user' && <Scale style={{ width:14, height:14, color:msg.role==='blocked'?'#DC2626':'#D4AF37', flexShrink:0, marginRight:8, marginTop:4 }} />}
                <div style={{ maxWidth:'84%', padding:'10px 14px', fontFamily:'Georgia,serif', fontSize:14, lineHeight:1.65, whiteSpace:'pre-line',
                  ...(msg.role==='user'?{background:'#0B1929',color:'white'}:msg.role==='blocked'?{background:'#FEF2F2',borderLeft:'3px solid #DC2626',color:'#7F1D1D'}:{background:'#F7F4EF',borderLeft:'3px solid #0B1929',color:'#1A1A1A'}) }}>
                  {msg.role==='blocked' && <p style={{ fontFamily:'DM Mono,monospace', fontSize:8, letterSpacing:'0.15em', textTransform:'uppercase', color:'#DC2626', marginBottom:6 }}>Request Blocked</p>}
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'DM Mono,monospace', fontSize:9, color:'#B8B0A0' }}><Loader2 style={{ width:12, height:12, color:'#B8960C', animation:'spin 1s linear infinite' }} />Processing — 60–90 seconds…</div>}
            <div ref={chatEnd} />
          </div>
          <div style={{ padding:'12px 16px', borderTop:'1px solid #E8E4DC', background:'#FAFAF8' }}>
            <div style={{ display:'flex', gap:8 }}>
              <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}} placeholder="Describe your case… (Enter to send)" rows={3} disabled={loading}
                style={{ flex:1, padding:'10px 14px', resize:'none', outline:'none', border:'1px solid #E8E4DC', background:'white', fontFamily:'Georgia,serif', fontSize:15, color:'#1A1A1A', lineHeight:1.5 }} />
              <button onClick={handleSend} disabled={loading||!input.trim()} style={{ padding:'0 14px', flexShrink:0, background:loading||!input.trim()?'#E8E4DC':'#0B1929', color:'white', border:'none', cursor:loading||!input.trim()?'not-allowed':'pointer', display:'flex', alignItems:'center' }}>
                {loading?<Loader2 style={{width:14,height:14,animation:'spin 1s linear infinite'}}/>:<Send style={{width:14,height:14}}/>}
              </button>
            </div>
          </div>
        </div>

        {/* Document */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#EDEAE3', overflow:'hidden' }}>
          <div style={{ padding:'10px 20px', background:'white', borderBottom:'1px solid #E8E4DC', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <FileText style={{ width:13, height:13, color:'#B8960C' }} />
              <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', color:'#6B6B6B' }}>Petition Draft</span>
              {doc && <span style={{ fontFamily:'DM Mono,monospace', fontSize:8, color:'#B8B0A0' }}>{doc.length.toLocaleString()} chars</span>}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>{navigator.clipboard.writeText(doc);setCopied(true);setTimeout(()=>setCopied(false),2000);}} disabled={!doc}
                style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'#6B6B6B', border:'1px solid #E8E4DC', padding:'6px 12px', background:'white', opacity:doc?1:0.4, cursor:doc?'pointer':'not-allowed' }}>
                {copied?<Check style={{width:10,height:10,color:'#16A34A'}}/>:<Copy style={{width:10,height:10}}/>} {copied?'Copied':'Copy'}
              </button>
              <button onClick={()=>doc&&downloadTxt(doc,'petition_draft.txt')} disabled={!doc}
                style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'#6B6B6B', border:'1px solid #E8E4DC', padding:'6px 12px', background:'white', opacity:doc?1:0.4, cursor:doc?'pointer':'not-allowed' }}>
                <File style={{width:10,height:10}}/>.TXT
              </button>
              <button onClick={handlePdf} disabled={!doc||pdfLoading}
                style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', padding:'6px 16px', background:doc&&!pdfLoading?'#0B1929':'#E8E4DC', color:doc&&!pdfLoading?'white':'#9CA8BC', border:'none', cursor:doc&&!pdfLoading?'pointer':'not-allowed' }}>
                {pdfLoading?<><Loader2 style={{width:10,height:10,animation:'spin 1s linear infinite'}}/>Generating…</>:<><FileDown style={{width:10,height:10}}/>Export PDF</>}
              </button>
            </div>
          </div>
          {blockReason && <div style={{ margin:'16px 24px 0' }}><GuardrailBanner severity="block" message={blockReason} onDismiss={()=>setBlock('')}/></div>}
          {warnings.length>0 && doc && <div style={{ margin:'16px 24px 0' }}><GuardrailBanner severity="warn" warnings={warnings} onDismiss={()=>setWarnings([])}/></div>}
          <div style={{ flex:1, overflowY:'auto', padding:'28px 32px', display:'flex', justifyContent:'center' }}>
            <div style={{ width:'100%', maxWidth:800, background:'white', minHeight:1123, padding:'72px', boxShadow:'0 4px 24px rgba(0,0,0,0.08)', border:'1px solid #E8E4DC' }}>
              {!doc ? (
                <div style={{ height:'100%', minHeight:900, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#B8B0A0' }}>
                  <FileText style={{ width:32, height:32, color:'#E8E4DC', marginBottom:20 }} />
                  <p style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:20, color:'#6B6B6B', marginBottom:8 }}>Court Petition Will Appear Here</p>
                  <p style={{ fontFamily:'Georgia,serif', fontSize:15, color:'#B8B0A0', textAlign:'center', maxWidth:320, lineHeight:1.65 }}>Describe your matter in the Agent Console. The petition will appear here for review before PDF export.</p>
                  <div style={{ marginTop:32, display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center' }}>
                    {['Habeas Corpus','Post-Arrest Bail','Pre-Arrest Bail','Quashment'].map(t=>(
                      <span key={t} style={{ fontFamily:'DM Mono,monospace', fontSize:8, letterSpacing:'0.08em', textTransform:'uppercase', color:'#B8B0A0', border:'1px solid #E8E4DC', padding:'5px 10px' }}>{t}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <textarea value={doc} onChange={e=>handleDocChange(e.target.value)}
                  style={{ width:'100%', resize:'none', outline:'none', color:'#1A1A1A', lineHeight:1.85, background:'transparent', fontFamily:'Times New Roman,Georgia,serif', fontSize:'12pt', minHeight:980, border:'none' }}
                  spellCheck={false} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── RAG Panel ─────────────────────────────────────────────────────────────────
  const RAGPanel = ({ session, onSave }) => {
    const [query,   setQuery]     = useState(session?.query || '');
    const [result,  setResult]    = useState(session?.result || '');
    const [loading, setLoading]   = useState(false);
    const [blockReason, setBlock] = useState('');
    const [warnings, setWarnings] = useState([]);

    // When a history item is selected, populate query + result immediately
    useEffect(() => {
      if (session) { setQuery(session.query); setResult(session.result); setBlock(''); setWarnings([]); }
    }, [session]);

    const EXAMPLES = ['Post-arrest bail Section 302 PPC','Habeas corpus illegal detention','Article 199 quashment mala fide FIR','Cases by Justice Yahya Afridi 2023','Pre-arrest bail extraordinary circumstances'];

    const search = async () => {
      if (!query.trim() || loading) return;
      setLoading(true); setBlock(''); setWarnings([]); setResult('');
      const q = query.trim();
      try {
        const data = await api.rag(q);
        if (data.status === 'blocked') { setBlock(data.result || data.guardrail_summary?.block_reason || 'Blocked.'); return; }
        if (data.status === 'ok') {
          setResult(data.result);
          const w = data.guardrail_warnings || [];
          setWarnings(w);
          const sessionData = { query: q, result: data.result };
          try {
            const created = await api.createSession('rag', q.slice(0, 80), sessionData);
            console.log('RAG session create response:', created);
            if (created.status === 'ok') {
              onSave({ id: created.id, feature: 'rag', label: q, ...sessionData, ts: new Date(created.created_at).getTime() });
            }
          } catch (e) { console.error('Failed to save RAG session:', e); }
        } else setBlock(data.result || 'Search failed.');
      } catch { setBlock('Network error.'); }
      finally { setLoading(false); }
    };

    return (
      <div style={{ flex:1, overflowY:'auto', padding:'40px 48px', background:'#F7F4EF' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ marginBottom:32, paddingBottom:24, borderBottom:'1px solid #E8E4DC' }}>
            <p style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.2em', textTransform:'uppercase', color:'#B8960C', marginBottom:10 }}>Hybrid Semantic + BM25 — 10,482 Judgments</p>
            <h2 style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:30, fontWeight:700, color:'#0B1929' }}>Precedent Search</h2>
          </div>

          <div style={{ display:'flex', marginBottom:12, borderBottom:'2px solid #0B1929', background:'white' }}>
            <div style={{ position:'relative', flex:1 }}>
              <Search style={{ width:14, height:14, color:'#B8B0A0', position:'absolute', left:14, top:'50%', transform:'translateY(-50%)' }} />
              <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()}
                placeholder="Search judgments, cite sections, find cases by judge or party…"
                style={{ width:'100%', paddingLeft:40, paddingRight:16, paddingTop:14, paddingBottom:14, outline:'none', border:'none', fontFamily:'Georgia,serif', fontSize:17, color:'#1A1A1A', background:'transparent' }} />
            </div>
            <button onClick={search} disabled={loading||!query.trim()}
              style={{ padding:'0 24px', fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', background:loading||!query.trim()?'#E8E4DC':'#0B1929', color:'white', border:'none', cursor:loading||!query.trim()?'not-allowed':'pointer', flexShrink:0 }}>
              {loading?<Loader2 style={{width:14,height:14,animation:'spin 1s linear infinite'}}/>:'Query'}
            </button>
          </div>

          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:32 }}>
            {EXAMPLES.map((ex,i)=>(
              <button key={i} onClick={()=>setQuery(ex)} style={{ fontFamily:'DM Mono,monospace', fontSize:8, letterSpacing:'0.1em', textTransform:'uppercase', color:'#6B6B6B', border:'1px solid #E8E4DC', padding:'5px 10px', background:'white', cursor:'pointer' }}>
                {ex}
              </button>
            ))}
          </div>

          {blockReason && <GuardrailBanner severity="block" message={blockReason} onDismiss={()=>setBlock('')}/>}
          {warnings.length>0 && <GuardrailBanner severity="warn" warnings={warnings} onDismiss={()=>setWarnings([])}/>}

          {result && (
            <div style={{ background:'white', border:'1px solid #E8E4DC' }}>
              <div style={{ padding:'10px 16px', borderBottom:'1px solid #E8E4DC', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#FAFAF8' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}><FileCheck2 style={{width:13,height:13,color:'#B8960C'}}/><span style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', color:'#0B1929' }}>Search Results</span></div>
                <button onClick={()=>navigator.clipboard.writeText(result)} style={{ fontFamily:'DM Mono,monospace', fontSize:8, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9CA8BC', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}><Copy style={{width:10,height:10}}/>Copy</button>
              </div>
              <div style={{ padding:'24px 20px' }}>
                <pre style={{ fontFamily:'DM Mono,Courier New,monospace', fontSize:12, color:'#3D3D3D', lineHeight:1.75, whiteSpace:'pre-wrap' }}>{result}</pre>
              </div>
            </div>
          )}

          {!result && !blockReason && !loading && (
            <div style={{ background:'white', border:'1px solid #E8E4DC', padding:'60px 24px', textAlign:'center' }}>
              <BookOpen style={{ width:24, height:24, color:'#E8E4DC', margin:'0 auto 12px' }} />
              <p style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:18, color:'#6B6B6B', marginBottom:6 }}>Database Ready</p>
              <p style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'#B8B0A0' }}>10,482 Judgments — Awaiting Query</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Summary Panel ─────────────────────────────────────────────────────────────
  const SummaryPanel = ({ session, onSave }) => {
    const [file,     setFile]     = useState(null);
    const [result,   setResult]   = useState(session?.result || '');
    const [loading,  setLoading]  = useState(false);
    const [blockReason, setBlock] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef(null);

    // When a history item is selected, show its result
    useEffect(() => {
      if (session) { setResult(session.result); setBlock(''); setFile(null); }
      else         { setResult(''); }
    }, [session]);

    const handleFile = (f) => {
      if (!f) return;
      const ok = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg'];
      if (!ok.includes(f.type)) { setBlock('Unsupported type. Use PDF, DOCX, TXT, PNG, or JPG.'); return; }
      setFile(f); setBlock(''); setResult('');
    };

    const submit = async () => {
      if (!file || loading) return;
      setLoading(true); setBlock(''); setResult('');
      try {
        const data = await api.summarize(file);
        if (data.status === 'blocked') { setBlock(data.guardrail_blocked_reason || 'Document blocked.'); return; }
        if (data.status === 'ok') {
          setResult(data.result);
          const sessionData = { filename: file.name, result: data.result };
          try {
            const created = await api.createSession('summarizer', file.name, sessionData);
            console.log('Summary session create response:', created);
            if (created.status === 'ok') {
              onSave({ id: created.id, feature: 'summarizer', label: file.name, ...sessionData, ts: new Date(created.created_at).getTime() });
            }
          } catch (e) { console.error('Failed to save summary session:', e); }
        } else setBlock(data.result || 'Summarization failed.');
      } catch { setBlock('Network error.'); }
      finally { setLoading(false); }
    };

    const resultFilename = session ? `${session.filename.replace(/\.[^.]+$/, '')}_memo.txt` : 'legal_memo.txt';

    return (
      <div style={{ flex:1, overflowY:'auto', padding:'40px 48px', background:'#F7F4EF' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ marginBottom:32, paddingBottom:24, borderBottom:'1px solid #E8E4DC' }}>
            <p style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.2em', textTransform:'uppercase', color:'#B8960C', marginBottom:10 }}>AI Extraction — Facts · Issues · Holding · Ratio</p>
            <h2 style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:30, fontWeight:700, color:'#0B1929' }}>Case File Briefing</h2>
          </div>

          {/* Only show upload area when not viewing a past session */}
          {!session && (
            <>
              <div
                onClick={()=>fileRef.current?.click()}
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
                style={{ border:`2px dashed ${dragOver?'#B8960C':'#D9D4C8'}`, padding:'48px 32px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', background:dragOver?'#FFFBEB':'#FAFAF8', marginBottom:16, transition:'all 0.15s' }}>
                <input ref={fileRef} type="file" style={{ display:'none' }} accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={e=>handleFile(e.target.files[0])} />
                <UploadCloud style={{ width:26, height:26, color:file?'#B8960C':'#D9D4C8', marginBottom:14 }} />
                {file ? (
                  <div style={{ textAlign:'center' }}>
                    <p style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:17, color:'#0B1929', marginBottom:4 }}>{file.name}</p>
                    <p style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9CA8BC' }}>{(file.size/1024).toFixed(1)} KB</p>
                    <button onClick={e=>{e.stopPropagation();setFile(null);}} style={{ fontFamily:'DM Mono,monospace', fontSize:8, color:'#DC2626', marginTop:10, display:'flex', alignItems:'center', gap:4, margin:'10px auto 0', background:'none', border:'none', cursor:'pointer' }}><X style={{width:10,height:10}}/>Remove</button>
                  </div>
                ) : (
                  <div style={{ textAlign:'center' }}>
                    <p style={{ fontFamily:'Playfair Display,Georgia,serif', fontSize:18, color:'#6B6B6B', marginBottom:6 }}>Drop a legal document here</p>
                    <p style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'#B8B0A0' }}>PDF, DOCX, TXT, PNG, JPG — up to 25 MB</p>
                  </div>
                )}
              </div>

              {blockReason && <GuardrailBanner severity="block" message={blockReason} onDismiss={()=>setBlock('')}/>}

              <button onClick={submit} disabled={!file||loading}
                style={{ width:'100%', padding:'13px 0', fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', background:!file||loading?'#E8E4DC':'#0B1929', color:!file||loading?'#9CA8BC':'white', border:'none', cursor:!file||loading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:32 }}>
                {loading?<><Loader2 style={{width:14,height:14,animation:'spin 1s linear infinite'}}/>Analysing — 60–90 seconds…</>:'Generate Legal Brief'}
              </button>
            </>
          )}

          {result && (
            <div style={{ background:'white', border:'1px solid #E8E4DC' }}>
              <div style={{ padding:'10px 16px', borderBottom:'1px solid #E8E4DC', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#FAFAF8' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <FileCheck2 style={{width:13,height:13,color:'#B8960C'}}/>
                  <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', color:'#0B1929' }}>
                    {session ? session.filename : 'Legal Memorandum'}
                  </span>
                  {session && <span style={{ fontFamily:'DM Mono,monospace', fontSize:8, color:'#B8B0A0' }}>{formatTime(session.ts)}</span>}
                </div>
                <button onClick={()=>downloadTxt(result, resultFilename)} style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'DM Mono,monospace', fontSize:8, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9CA8BC', background:'none', border:'none', cursor:'pointer' }}><Download style={{width:10,height:10}}/>Download .TXT</button>
              </div>
              <div style={{ padding:'32px', minHeight:400 }}>
                <pre style={{ fontFamily:'Times New Roman,Georgia,serif', fontSize:'12pt', color:'#1A1A1A', lineHeight:1.85, whiteSpace:'pre-wrap' }}>{result}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Router ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#F7F4EF', color:'#1A1A1A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,700&family=DM+Mono:wght@300;400;500&display=swap');
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        * { box-sizing:border-box; }
        button { cursor:pointer; }
        ::selection { background:#0B1929; color:white; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#F7F4EF; }
        ::-webkit-scrollbar-thumb { background:#D9D4C8; }
        ::-webkit-scrollbar-thumb:hover { background:#B8960C; }
        textarea, input { color-scheme:light; }
      `}</style>
      <Navbar />
      {page==='landing'   && <LandingPage />}
      {page==='pricing'   && <PricingPage />}
      {page==='login'     && <AuthPage type="login" />}
      {page==='signup'    && <AuthPage type="signup" />}
      {page==='workspace' && <Workspace />}
    </div>
  );
}
