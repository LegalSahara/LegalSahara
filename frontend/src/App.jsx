import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Scale, FileText, Search, Shield, UploadCloud, Download, Edit3,
  CheckCircle2, ChevronRight, LogOut, Bold, Italic, AlignLeft,
  AlignCenter, File, BookOpen, Gavel, ArrowRight, FileCheck2,
  MessageSquare, Loader2, AlertCircle, X, Menu, ChevronDown,
  Sparkles, Landmark, ScrollText, Users, Star, Send, RotateCcw,
  Copy, Check, PenLine, Brain, Zap, Database, FileDown,
} from 'lucide-react';

// ─── API layer ────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL || '';

const api = {
  async draft(story) {
    const form = new FormData();
    form.append('story', story);
    form.append('user_id', 'web_user');
    const res = await fetch(`${API_BASE}/draft`, { method: 'POST', body: form });
    return res.json();
  },
  async rag(query) {
    const form = new FormData();
    form.append('query', query);
    const res = await fetch(`${API_BASE}/rag`, { method: 'POST', body: form });
    return res.json();
  },
  async summarize(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/summarize`, { method: 'POST', body: form });
    return res.json();
  },
  async health() {
    try {
      const res = await fetch(`${API_BASE}/health`);
      return res.ok;
    } catch { return false; }
  },
  /** Call backend PDF generator and return a Blob URL */
  async draftPdf(petitionText) {
    const form = new FormData();
    form.append('petition_text', petitionText);
    const res = await fetch(`${API_BASE}/draft/pdf`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`PDF endpoint returned ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

// ─── Helper: plain text download ──────────────────────────────────────────────
function downloadTxt(text, filename = 'petition.txt') {
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Reusable Components ──────────────────────────────────────────────────────
const StatusDot = ({ online }) => (
  <span className="flex items-center gap-1.5">
    <span className="relative flex h-2 w-2">
      {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${online ? 'bg-emerald-500' : 'bg-red-500'}`} />
    </span>
    <span className="text-[10px] text-slate-400 uppercase tracking-widest">
      {online ? 'Online' : 'Offline'}
    </span>
  </span>
);

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]             = useState('landing');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab]   = useState('drafter');
  const [apiOnline, setApiOnline]   = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api.health().then(setApiOnline);
    const id = setInterval(() => api.health().then(setApiOnline), 30000);
    return () => clearInterval(id);
  }, []);

  const navigate = useCallback((p) => {
    setPage(p); setMobileMenuOpen(false); window.scrollTo(0, 0);
  }, []);

  const login  = () => { setIsLoggedIn(true);  navigate('workspace'); };
  const logout = () => { setIsLoggedIn(false); navigate('landing'); };

  // ── Navbar ──────────────────────────────────────────────────────────────────
  const Navbar = () => (
    <nav className="bg-navy-900/95 backdrop-blur border-b border-white/5 sticky top-0 z-50"
         style={{ background: 'rgba(10,22,40,0.97)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('landing')}>
            <Scale className="h-7 w-7 text-yellow-500 group-hover:text-yellow-400 transition-colors" />
            <div>
              <span className="text-xl font-serif font-bold text-white tracking-tight">Legal</span>
              <span className="text-xl font-serif font-bold text-yellow-500 tracking-tight"> Sahara</span>
            </div>
            <div className="hidden md:block ml-2"><StatusDot online={apiOnline} /></div>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => navigate('landing')} className="text-xs font-semibold text-slate-400 hover:text-white uppercase tracking-widest transition-colors">Platform</button>
            <button onClick={() => navigate('pricing')} className="text-xs font-semibold text-slate-400 hover:text-white uppercase tracking-widest transition-colors">Pricing</button>
            <div className="w-px h-5 bg-white/10" />
            {isLoggedIn ? (
              <div className="flex items-center gap-4">
                <button onClick={() => navigate('workspace')} className="text-xs font-bold text-yellow-400 hover:text-yellow-300 uppercase tracking-widest transition-colors">Workspace</button>
                <button onClick={logout} className="text-slate-500 hover:text-red-400 transition-colors"><LogOut className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={() => navigate('login')} className="text-xs font-semibold text-slate-400 hover:text-white uppercase tracking-widest transition-colors">Login</button>
                <button onClick={() => navigate('signup')} className="bg-yellow-500 hover:bg-yellow-400 text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded-sm transition-colors" style={{ color: '#0A1628' }}>
                  Apply for Access
                </button>
              </div>
            )}
          </div>

          <button className="md:hidden text-slate-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-yellow-600/60 to-transparent" />
      {mobileMenuOpen && (
        <div className="md:hidden bg-navy-900 border-t border-white/5 px-4 py-4 space-y-3">
          <button onClick={() => navigate('landing')} className="block w-full text-left text-sm text-slate-300 py-2">Platform</button>
          <button onClick={() => navigate('pricing')} className="block w-full text-left text-sm text-slate-300 py-2">Pricing</button>
          {isLoggedIn ? (
            <>
              <button onClick={() => navigate('workspace')} className="block w-full text-left text-sm text-yellow-400 py-2">Workspace</button>
              <button onClick={logout} className="block w-full text-left text-sm text-red-400 py-2">Logout</button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('login')} className="block w-full text-left text-sm text-slate-300 py-2">Login</button>
              <button onClick={() => navigate('signup')} className="block w-full text-sm font-bold text-navy-900 bg-yellow-500 py-2 text-center rounded-sm" style={{ color: '#0A1628' }}>Apply for Access</button>
            </>
          )}
        </div>
      )}
    </nav>
  );

  // ── Landing Page ─────────────────────────────────────────────────────────────
  const LandingPage = () => (
    <div className="bg-navy-900 min-h-screen" style={{ background: 'linear-gradient(135deg,#03082E 0%,#0A1628 60%,#0F2044 100%)' }}>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%,rgba(38,83,168,0.15) 0%,transparent 70%)' }} />
        <div className="relative max-w-7xl mx-auto px-4 pt-28 pb-36">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-8">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs text-slate-300 font-medium tracking-wider uppercase">Pakistan's First Agentic Legal AI</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-white leading-[1.08] mb-6 max-w-4xl">
            The Standard for <br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg,#E8C84A,#B8860B)' }}>
              Legal Intelligence
            </span>
            <br />in Pakistan.
          </h1>
          <p className="text-lg text-slate-400 mb-10 leading-relaxed max-w-2xl border-l-2 border-yellow-700/50 pl-5">
            Empowering High Court and Supreme Court advocates with Agentic AI. Research PLD &amp; SCMR precedents, brief voluminous case files, and draft court-ready petitions with absolute precision — exported as professionally typeset PDFs.
          </p>
          <div className="flex flex-wrap gap-4">
            <button onClick={() => navigate('signup')} className="bg-yellow-500 hover:bg-yellow-400 text-xs font-bold uppercase tracking-widest px-8 py-4 rounded-sm flex items-center gap-2 transition-all shadow-lg shadow-yellow-500/20" style={{ color: '#0A1628' }}>
              Access Workspace <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('pricing')} className="border border-white/15 hover:border-white/30 text-white text-xs font-bold uppercase tracking-widest px-8 py-4 rounded-sm transition-all">
              View Retainers
            </button>
          </div>
        </div>
      </div>

      <div className="border-y border-white/5 bg-white/[0.02] backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { n: '10,482+', label: 'Judgments Indexed' },
            { n: '5 Types', label: 'Petition Formats' },
            { n: 'PLD / SCMR', label: 'Citation Authority' },
            { n: '< 90s', label: 'Avg. Draft Time' },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-serif font-bold text-yellow-400">{s.n}</div>
              <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-24">
        <div className="mb-16">
          <p className="text-xs text-yellow-600 uppercase tracking-widest font-semibold mb-3">Engineered for the Judiciary and Bar</p>
          <h2 className="text-4xl font-serif font-bold text-white">Core Capabilities</h2>
          <div className="h-px w-24 bg-gradient-to-r from-yellow-600 to-transparent mt-4" />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: BookOpen, title: 'Precedent Research (RAG)', desc: 'Semantic + BM25 hybrid search across 10,000+ indexed judgments. Retrieve ratio decidendi with verified citation authority (PLD → SCMR → YLR).', badge: 'Vector DB' },
            { icon: FileCheck2, title: 'Case File Briefing', desc: 'Upload voluminous FIRs, charge sheets, or lower court orders. Receive a structured legal memo covering facts, issues, holding, and ratio decidendi.', badge: 'OCR Enabled' },
            { icon: Gavel, title: 'Agentic Drafting + PDF', desc: 'Classifies your case, detects red flags, retrieves precedents, and auto-formats all 5 petition types — then exports a court-ready PDF with professional typesetting.', badge: 'LangGraph + PDF' },
          ].map(({ icon: Icon, title, desc, badge }, i) => (
            <div key={i} className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/8 hover:border-white/15 rounded-sm p-8 transition-all">
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-sm bg-navy-800 border border-white/10 flex items-center justify-center" style={{ background: 'rgba(30,64,128,0.3)' }}>
                  <Icon className="w-6 h-6 text-yellow-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-600/70 bg-yellow-600/10 px-2 py-1 rounded-sm border border-yellow-600/20">{badge}</span>
              </div>
              <h3 className="text-lg font-serif font-bold text-white mb-3">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-24">
        <div className="bg-white/[0.02] border border-white/8 rounded-sm p-10">
          <h3 className="text-2xl font-serif font-bold text-white mb-2">Supported Petition Types</h3>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-8">Auto-classified from your case description</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {['Habeas Corpus', 'Post-Arrest Bail', 'Pre-Arrest Bail', 'Quashment', 'Property / Encroachment'].map((t, i) => (
              <div key={i} className="bg-navy-800/50 border border-white/10 rounded-sm p-4 text-center">
                <ScrollText className="w-5 h-5 text-yellow-500/70 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-300">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 bg-black/20 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-yellow-500/60" />
            <span className="text-sm text-slate-600 font-serif font-bold">Legal Sahara</span>
          </div>
          <p className="text-xs text-slate-600 text-center">
            Not a substitute for qualified legal advice. Always verify AI-generated content with a licensed advocate.
          </p>
          <p className="text-xs text-slate-700">© 2026 Legal Sahara. All rights reserved.</p>
        </div>
      </div>
    </div>
  );

  // ── Pricing Page ─────────────────────────────────────────────────────────────
  const PricingPage = () => (
    <div className="min-h-screen py-24" style={{ background: 'linear-gradient(135deg,#03082E 0%,#0A1628 60%,#0F2044 100%)' }}>
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-16">
          <p className="text-xs text-yellow-600 uppercase tracking-widest font-semibold mb-3">Transparent Licensing</p>
          <h2 className="text-4xl font-serif font-bold text-white">Software Retainers</h2>
          <div className="h-px w-24 bg-gradient-to-r from-yellow-600 to-transparent mx-auto mt-4" />
        </div>
        <div className="grid md:grid-cols-3 gap-0 border border-white/10 rounded-sm overflow-hidden shadow-2xl">
          {[
            { name: 'Academic / Junior', price: '0', desc: 'For law students & junior associates.', features: ['5 Precedent Queries / month', 'Standard Drafting Assistant', 'Basic Text Summarization'], cta: 'Get Started' },
            { name: 'Advocate Pro', price: '2,500', desc: 'For practicing High Court advocates.', features: ['250 Precedent Queries / month', 'Full PDF Briefing Engine', 'Court-Ready PDF Export', 'Priority Agent Processing'], cta: 'Select Pro', highlight: true },
            { name: 'Chamber / Firm', price: '10,000', desc: 'For established law chambers.', features: ['Unlimited Agent Usage', 'Upload Custom Firm Precedents', 'Multi-user Access (Up to 5)', 'Dedicated Legal Engineer Support'], cta: 'Contact Us' },
          ].map((plan, i) => (
            <div key={i} className={`p-10 flex flex-col ${plan.highlight ? 'relative' : 'border-r border-white/5 last:border-0'}`}
              style={plan.highlight ? { background: 'linear-gradient(160deg,#1E4080,#163058)', border: '1px solid rgba(184,134,11,0.3)' } : { background: 'rgba(255,255,255,0.02)' }}>
              {plan.highlight && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-yellow-700 via-yellow-400 to-yellow-700" />}
              {plan.highlight && <div className="inline-block text-[10px] font-bold uppercase tracking-widest text-yellow-600 bg-yellow-600/10 border border-yellow-600/30 px-3 py-1 rounded-sm mb-6 self-start">Most Popular</div>}
              <h3 className="text-xl font-serif font-bold text-white mb-1">{plan.name}</h3>
              <p className="text-xs text-slate-400 mb-8 h-8">{plan.desc}</p>
              <div className="mb-8 pb-8 border-b border-white/10">
                <span className="text-sm text-slate-400 align-top font-semibold">Rs. </span>
                <span className="text-5xl font-serif font-bold text-white">{plan.price}</span>
                <span className="text-sm text-slate-500 ml-1">/mo</span>
              </div>
              <ul className="space-y-4 mb-10 flex-1">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${plan.highlight ? 'text-yellow-400' : 'text-slate-500'}`} />
                    <span className={plan.highlight ? 'text-slate-200' : 'text-slate-400'}>{f}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => navigate('signup')} className={`w-full py-3.5 text-xs font-bold uppercase tracking-widest rounded-sm transition-all ${plan.highlight ? 'bg-yellow-500 hover:bg-yellow-400 shadow-lg shadow-yellow-500/20' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'}`} style={plan.highlight ? { color: '#0A1628' } : {}}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Auth Page ─────────────────────────────────────────────────────────────────
  const AuthPage = ({ type }) => (
    <div className="min-h-[90vh] flex items-center justify-center px-4" style={{ background: 'linear-gradient(135deg,#03082E 0%,#0A1628 100%)' }}>
      <div className="w-full max-w-md">
        <div className="bg-white/[0.03] border border-white/10 rounded-sm p-10 shadow-2xl">
          <div className="text-center mb-10">
            <Scale className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-serif font-bold text-white uppercase tracking-widest">
              {type === 'login' ? 'Chamber Login' : 'Register Profile'}
            </h2>
            <div className="h-0.5 w-12 bg-gradient-to-r from-yellow-700 to-yellow-400 mx-auto mt-4" />
          </div>
          <div className="space-y-5">
            {type === 'signup' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Advocate Name</label>
                <input type="text" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-sm text-white text-sm focus:outline-none focus:border-yellow-500/50 transition-all placeholder-slate-600" placeholder="e.g. Ali Khan, Advocate" />
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Professional Email</label>
              <input type="email" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-sm text-white text-sm focus:outline-none focus:border-yellow-500/50 transition-all placeholder-slate-600" placeholder="name@lawfirm.com.pk" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Password</label>
              <input type="password" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-sm text-white text-sm focus:outline-none focus:border-yellow-500/50 transition-all placeholder-slate-600" placeholder="••••••••" />
            </div>
            <button onClick={login} className="w-full bg-yellow-500 hover:bg-yellow-400 py-4 text-xs font-bold tracking-widest uppercase rounded-sm transition-all shadow-lg shadow-yellow-500/20 mt-2" style={{ color: '#0A1628' }}>
              {type === 'login' ? 'Authenticate' : 'Submit Application'}
            </button>
          </div>
          <div className="mt-8 text-center border-t border-white/8 pt-6">
            <p className="text-sm text-slate-500">
              {type === 'login' ? 'Not registered? ' : 'Have chamber access? '}
              <button onClick={() => navigate(type === 'login' ? 'signup' : 'login')} className="text-yellow-400 hover:text-yellow-300 font-bold transition-colors">
                {type === 'login' ? 'Apply Here' : 'Log In'}
              </button>
            </p>
            <button onClick={login} className="mt-4 text-xs text-slate-600 hover:text-slate-400 transition-colors underline underline-offset-2">
              Skip login (demo mode)
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Workspace ─────────────────────────────────────────────────────────────────
  const Workspace = () => {
    const navItems = [
      { id: 'drafter',    icon: Edit3,     label: 'Agentic Drafter',   desc: 'Draft petitions' },
      { id: 'rag',        icon: Database,  label: 'Precedent Search',  desc: 'Case research' },
      { id: 'summarizer', icon: Brain,     label: 'Case Briefing',     desc: 'Summarize docs' },
    ];
    return (
      <div className="flex min-h-[calc(100vh-64px)]" style={{ background: '#07101F' }}>
        <aside className="w-60 flex flex-col shrink-0 border-r border-white/5" style={{ background: '#040C1A' }}>
          <div className="p-5 border-b border-white/5">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-4">User Profile</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm flex items-center justify-center font-serif font-bold text-yellow-400 text-sm border border-yellow-600/30" style={{ background: 'rgba(184,134,11,0.1)' }}>AK</div>
              <div>
                <p className="text-sm font-semibold text-white">Adv. Ali Khan</p>
                <p className="text-[10px] text-yellow-600 uppercase tracking-wider">Pro License</p>
              </div>
            </div>
          </div>
          <div className="p-4 flex-1">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3 px-2">Legal Agents</p>
            <nav className="space-y-1">
              {navItems.map(({ id, icon: Icon, label, desc }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-sm text-left transition-all ${activeTab === id ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  style={activeTab === id ? { background: 'rgba(38,83,168,0.25)', borderLeft: '2px solid #E8C84A' } : {}}>
                  <Icon className={`w-4 h-4 shrink-0 ${activeTab === id ? 'text-yellow-400' : ''}`} />
                  <div>
                    <p className="text-xs font-semibold leading-tight">{label}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </nav>
          </div>
          <div className="p-4 border-t border-white/5">
            <div className="flex items-center justify-between">
              <StatusDot online={apiOnline} />
              <button onClick={logout} className="text-slate-600 hover:text-red-400 transition-colors">
                <LogOut className="w-4 h-4" />
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
    const [messages, setMessages] = useState([{
      role: 'agent',
      text: 'Counsel, please provide the brief facts of the case — include the names of the parties, the police station or authority involved, and the nature of the detention or legal issue. I will classify, research precedents, and draft the pleadings.'
    }]);
    const [input,      setInput]      = useState('');
    const [doc,        setDoc]        = useState('');
    const [loading,    setLoading]    = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [copied,     setCopied]     = useState(false);
    const [meta,       setMeta]       = useState(null);   // petition meta info
    const chatEnd    = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const addMsg = (role, text) => setMessages(prev => [...prev, { role, text }]);

    const handleSend = async () => {
      const story = input.trim();
      if (!story || loading) return;
      setInput('');
      addMsg('user', story);
      setLoading(true);

      addMsg('agent', '⚙️ Classifying case type and detecting jurisdiction...');
      addMsg('agent', '📚 Retrieving relevant precedents from indexed judgments...');
      addMsg('agent', '✍️ Drafting petition with applicable legal strategy...');

      try {
        const data = await api.draft(story);
        if (data.status === 'ok' && data.result) {
          setDoc(data.result);
          setMeta({
            type:       data.petition_type,
            court:      data.jurisdiction,
            primary:    data.primary_citation,
            supporting: data.supporting_citation,
            score:      data.eval_overall_score,
            flags:      data.red_flags || [],
          });
          addMsg('agent',
            `✅ ${data.petition_type || 'Petition'} drafted for ${data.jurisdiction || 'the relevant court'}.\n` +
            `Primary citation: ${data.primary_citation || 'N/A'} · Score: ${(data.eval_overall_score || 0).toFixed(1)}/10\n\n` +
            `Review and edit the document in the right panel, then export as PDF.`
          );
        } else {
          addMsg('agent', `⚠️ ${data.result || 'An error occurred. Please check the backend is running and ChromaDB is populated.'}`);
        }
      } catch (err) {
        addMsg('agent', '❌ Network error. Please ensure the backend server is running on port 8000.');
      } finally {
        setLoading(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    /** Download the current edited text as a professional PDF from the backend */
    const handleDownloadPdf = async () => {
      if (!doc || pdfLoading) return;
      setPdfLoading(true);
      try {
        const url = await api.draftPdf(doc);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = 'legal_petition.pdf';
        a.click();
        URL.revokeObjectURL(url);
        addMsg('agent', '✅ Court-ready PDF downloaded. Please review carefully with your client before filing.');
      } catch (err) {
        addMsg('agent', `⚠️ PDF generation failed: ${err.message}. You can still use Export .TXT for a plain-text copy.`);
      } finally {
        setPdfLoading(false);
      }
    };

    const copyToClipboard = () => {
      navigator.clipboard.writeText(doc);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const clearAll = () => {
      setMessages([{ role: 'agent', text: 'Counsel, please provide the brief facts of the case...' }]);
      setDoc(''); setMeta(null);
    };

    return (
      <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>

        {/* LEFT: Chat Console */}
        <div className="w-[38%] flex flex-col border-r border-white/5" style={{ background: '#040C1A', minWidth: '320px' }}>
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between" style={{ background: 'rgba(38,83,168,0.1)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-sm flex items-center justify-center" style={{ background: 'rgba(38,83,168,0.3)' }}>
                <Shield className="w-4 h-4 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-widest">Agent Console</h2>
                <p className="text-[10px] text-slate-500">LangGraph Agentic Pipeline</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusDot online={apiOnline} />
              <button onClick={clearAll} className="text-slate-600 hover:text-slate-400 transition-colors" title="Clear session">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Meta badge row */}
          {meta && (
            <div className="px-4 py-2 border-b border-white/5 flex flex-wrap gap-2">
              <span className="text-[10px] bg-blue-900/40 text-blue-300 border border-blue-700/30 px-2 py-0.5 rounded-sm">{meta.type}</span>
              <span className="text-[10px] bg-yellow-900/20 text-yellow-400 border border-yellow-700/30 px-2 py-0.5 rounded-sm">{meta.court}</span>
              {meta.score > 0 && <span className="text-[10px] bg-emerald-900/20 text-emerald-400 border border-emerald-700/30 px-2 py-0.5 rounded-sm">{meta.score.toFixed(1)}/10</span>}
              {meta.flags.length > 0 && <span className="text-[10px] bg-red-900/20 text-red-400 border border-red-700/30 px-2 py-0.5 rounded-sm">⚠️ {meta.flags.length} flag(s)</span>}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'agent' && (
                  <div className="w-6 h-6 rounded-sm flex items-center justify-center mr-2 shrink-0 mt-0.5" style={{ background: 'rgba(184,134,11,0.2)', border: '1px solid rgba(184,134,11,0.3)' }}>
                    <Scale className="w-3 h-3 text-yellow-500" />
                  </div>
                )}
                <div className={`max-w-[84%] px-4 py-3 text-xs leading-relaxed rounded-sm whitespace-pre-line ${msg.role === 'user' ? 'text-white border border-blue-700/30' : 'text-slate-300 border border-white/5'}`}
                  style={msg.role === 'user' ? { background: 'rgba(38,83,168,0.35)' } : { background: 'rgba(255,255,255,0.03)' }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
                <span>Agent processing — this may take 60–90 seconds...</span>
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          <div className="p-4 border-t border-white/5">
            <div className="flex gap-2">
              <textarea
                value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Describe your case to the agent… (Enter to send)"
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3 text-xs text-white placeholder-slate-600 outline-none focus:border-yellow-500/30 resize-none transition-all"
                rows={3} disabled={loading}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed px-4 rounded-sm transition-all flex items-center justify-center shrink-0"
                style={{ color: '#0A1628' }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-700 mt-2">Shift+Enter for new line · Enter to send</p>
          </div>
        </div>

        {/* RIGHT: Document Editor */}
        <div className="flex-1 flex flex-col" style={{ background: '#0A1628' }}>

          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between flex-wrap gap-2"
               style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest">
              <FileText className="w-3.5 h-3.5 text-yellow-500/60" />
              <span>Petition Draft</span>
              {doc && <span className="text-slate-700">· {doc.length.toLocaleString()} chars</span>}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Copy */}
              <button onClick={copyToClipboard} disabled={!doc}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>

              {/* Export .TXT */}
              <button onClick={() => doc && downloadTxt(doc, 'petition_draft.txt')} disabled={!doc}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                <File className="w-3 h-3" /> .TXT
              </button>

              {/* Export Court PDF — primary CTA */}
              <button onClick={handleDownloadPdf} disabled={!doc || pdfLoading}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/10"
                style={doc && !pdfLoading
                  ? { background: 'linear-gradient(135deg,#B8860B,#E8C84A)', color: '#0A1628' }
                  : { background: 'rgba(184,134,11,0.15)', color: 'rgba(255,255,255,0.25)' }}>
                {pdfLoading
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating PDF…</>
                  : <><FileDown className="w-3 h-3" /> Export Court PDF</>
                }
              </button>
            </div>
          </div>

          {/* A4 paper area */}
          <div className="flex-1 overflow-y-auto p-8 flex justify-center" style={{ background: '#0F1929' }}>
            <div className="w-full max-w-[800px] bg-white shadow-2xl min-h-[1123px] p-[72px] rounded-sm border border-white/10"
                 style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
              {!doc ? (
                <div className="h-full min-h-[900px] flex flex-col items-center justify-center text-slate-400">
                  <div className="w-16 h-16 rounded-sm flex items-center justify-center mb-6"
                       style={{ background: 'rgba(184,134,11,0.06)', border: '1px solid rgba(184,134,11,0.1)' }}>
                    <FileText className="w-8 h-8 text-yellow-600/30" />
                  </div>
                  <p className="font-serif text-xl text-slate-300 mb-2">Court Petition Will Appear Here</p>
                  <p className="text-sm text-slate-500 text-center max-w-sm">
                    Describe your case in the Agent Console. The petition will be shown here for review and editing before PDF export.
                  </p>
                  <div className="mt-8 grid grid-cols-2 gap-3 text-xs text-slate-500 max-w-sm w-full">
                    {['Habeas Corpus', 'Post-Arrest Bail', 'Pre-Arrest Bail', 'Quashment'].map(t => (
                      <div key={t} className="flex items-center gap-2 bg-slate-50/50 border border-slate-200 rounded px-3 py-2">
                        <ScrollText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-600">{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={doc} onChange={e => setDoc(e.target.value)}
                  className="w-full resize-none outline-none text-slate-900 leading-[1.85] bg-transparent"
                  style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '12pt', minHeight: '980px' }}
                  spellCheck={false}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── RAG Agent ─────────────────────────────────────────────────────────────────
  const RAGAgent = () => {
    const [query,   setQuery]   = useState('');
    const [result,  setResult]  = useState('');
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');
    const [history, setHistory] = useState([]);

    const search = async () => {
      if (!query.trim() || loading) return;
      setLoading(true); setError(''); setResult('');
      const q = query.trim();
      try {
        const data = await api.rag(q);
        if (data.status === 'ok') {
          setResult(data.result);
          setHistory(prev => [{ q, r: data.result, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
        } else {
          setError(data.result || 'Search failed.');
        }
      } catch { setError('Network error. Ensure backend is running.'); }
      finally { setLoading(false); }
    };

    const EXAMPLES = [
      'Post-arrest bail in murder cases Section 302 PPC',
      'Habeas corpus illegal detention without warrant',
      'Article 199 quashment of FIR mala fide intent',
      'Cases by Justice Yahya Afridi 2023',
      'Pre-arrest bail extraordinary circumstances',
    ];

    return (
      <div className="flex-1 overflow-y-auto p-8" style={{ background: '#07101F' }}>
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-6 h-6 text-yellow-400" />
              <h2 className="text-2xl font-serif font-bold text-white">Precedent Search Engine</h2>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Hybrid Semantic + BM25 Retrieval · 10,482 Judgments</p>
            <div className="h-px w-full bg-gradient-to-r from-yellow-700/30 to-transparent mt-4" />
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="Search judgments, cite sections, find cases by judge or party..."
              className="w-full pl-11 pr-32 py-4 bg-white/[0.04] border border-white/10 rounded-sm text-white text-sm placeholder-slate-600 outline-none focus:border-yellow-500/40 transition-all"
            />
            <button onClick={search} disabled={loading || !query.trim()}
              className="absolute right-2 top-2 bottom-2 px-6 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg,#B8860B,#E8C84A)', color: '#0A1628' }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Query DB'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-8">
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setQuery(ex)}
                className="text-[10px] text-slate-500 hover:text-yellow-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/8 hover:border-yellow-500/30 px-3 py-1.5 rounded-sm transition-all">
                {ex}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-red-900/20 border border-red-700/30 rounded-sm p-4 mb-6 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}

          {result && (
            <div className="bg-white/[0.03] border border-white/10 rounded-sm overflow-hidden mb-8">
              <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between" style={{ background: 'rgba(38,83,168,0.15)' }}>
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Search Results</span>
                </div>
                <button onClick={() => navigator.clipboard.writeText(result)} className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              <div className="p-6">
                <pre className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{result}</pre>
              </div>
            </div>
          )}

          {!result && !error && !loading && (
            <div className="bg-white/[0.02] border border-white/8 rounded-sm p-16 text-center">
              <BookOpen className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-sm font-semibold text-slate-500">Database Connected: 10,482 Judgments Indexed</p>
              <p className="text-xs text-slate-700 mt-1">Ready for semantic query</p>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-3">Recent Queries</p>
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-sm px-4 py-3 cursor-pointer hover:bg-white/[0.04] transition-all"
                    onClick={() => { setQuery(h.q); setResult(h.r); }}>
                    <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="text-xs text-slate-400 flex-1 truncate">{h.q}</span>
                    <span className="text-[10px] text-slate-700">{h.ts}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Summarizer Agent ──────────────────────────────────────────────────────────
  const SummarizerAgent = () => {
    const [file,    setFile]    = useState(null);
    const [result,  setResult]  = useState('');
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef(null);

    const handleFile = (f) => {
      if (!f) return;
      const allowed = ['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'image/png', 'image/jpeg'];
      if (!allowed.includes(f.type)) {
        setError('Unsupported file type. Upload PDF, DOCX, TXT, PNG, or JPG.');
        return;
      }
      setFile(f); setError('');
    };

    const submit = async () => {
      if (!file || loading) return;
      setLoading(true); setError(''); setResult('');
      try {
        const data = await api.summarize(file);
        if (data.status === 'ok') setResult(data.result);
        else setError(data.result || 'Summarization failed.');
      } catch { setError('Network error.'); }
      finally { setLoading(false); }
    };

    return (
      <div className="flex-1 overflow-y-auto p-8" style={{ background: '#07101F' }}>
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Brain className="w-6 h-6 text-yellow-400" />
              <h2 className="text-2xl font-serif font-bold text-white">Case File Briefing</h2>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-widest">AI extraction · Facts · Issues · Holding · Ratio Decidendi</p>
            <div className="h-px w-full bg-gradient-to-r from-yellow-700/30 to-transparent mt-4" />
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-sm overflow-hidden">
            <div className="p-6">
              <div
                className={`border-2 border-dashed rounded-sm p-16 flex flex-col items-center justify-center cursor-pointer transition-all ${dragOver ? 'border-yellow-500/50' : 'border-white/10 hover:border-white/20'}`}
                style={dragOver ? { background: 'rgba(184,134,11,0.05)' } : { background: 'rgba(255,255,255,0.01)' }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}>
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                  onChange={e => handleFile(e.target.files[0])} />
                <UploadCloud className={`w-12 h-12 mb-4 ${file ? 'text-yellow-400' : 'text-slate-600'}`} />
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-yellow-400">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Ready</p>
                    <button onClick={e => { e.stopPropagation(); setFile(null); }}
                      className="mt-3 text-xs text-slate-600 hover:text-red-400 flex items-center gap-1 mx-auto">
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-300">Drop document here</p>
                    <p className="text-xs text-slate-600 mt-1">PDF, DOCX, TXT, PNG, JPG — up to 25 MB</p>
                    <button className="mt-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-sm transition-all">
                      Browse Files
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 mt-4 text-xs text-red-300 bg-red-900/20 border border-red-700/20 rounded-sm p-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}

              <button onClick={submit} disabled={!file || loading}
                className="mt-5 w-full py-4 text-xs font-bold uppercase tracking-widest rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#B8860B,#E8C84A)', color: '#0A1628' }}>
                {loading
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analysing Document — may take 60–90 seconds…</span>
                  : 'Generate Executive Legal Brief'}
              </button>
            </div>
          </div>

          {result && (
            <div className="mt-8 bg-white/[0.03] border border-white/10 rounded-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between" style={{ background: 'rgba(38,83,168,0.15)' }}>
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Legal Memo</span>
                </div>
                <button onClick={() => downloadTxt(result, 'legal_memo.txt')}
                  className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
                  <Download className="w-3 h-3" /> Download .TXT
                </button>
              </div>
              <div className="p-6">
                <pre className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap"
                     style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px' }}>{result}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Router ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-slate-100" style={{ background: '#040C1A' }}>
      <Navbar />
      {page === 'landing'   && <LandingPage />}
      {page === 'pricing'   && <PricingPage />}
      {page === 'login'     && <AuthPage type="login" />}
      {page === 'signup'    && <AuthPage type="signup" />}
      {page === 'workspace' && <Workspace />}
      <style>{`
        @media print {
          nav, aside, .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          textarea { color: black !important; background: white !important; border: none !important; }
        }
        .animate-in { animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
