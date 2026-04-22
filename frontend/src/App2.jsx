import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Scale, FileText, Search, Shield, UploadCloud, Download, Edit3,
  CheckCircle2, ChevronRight, LogOut, File, BookOpen, Gavel,
  ArrowRight, FileCheck2, MessageSquare, Loader2, AlertCircle,
  X, Menu, Sparkles, ScrollText, Send, RotateCcw, Copy, Check,
  Brain, Database, FileDown, ChevronDown,
} from 'lucide-react';

// ── API layer ────────────────────────────────────────────────────────────────
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
  async draftPdf(petitionText) {
    const form = new FormData();
    form.append('petition_text', petitionText);
    const res = await fetch(`${API_BASE}/draft/pdf`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`PDF endpoint returned ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

function downloadTxt(text, filename = 'petition.txt') {
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Status indicator ─────────────────────────────────────────────────────────
const StatusDot = ({ online }) => (
  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}
        className={`flex items-center gap-1.5 ${online ? 'text-emerald-700' : 'text-red-600'}`}>
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-600' : 'bg-red-500'}`} />
    {online === null ? 'Checking' : online ? 'Systems Online' : 'Offline'}
  </span>
);

// ── Main App ─────────────────────────────────────────────────────────────────
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
    <nav style={{ background: '#0C1B33', borderBottom: '1px solid #1E3A5F' }}
         className="sticky top-0 z-50">
      {/* Gold rule at very top */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, #B8960C, #D4AF37, #B8960C)' }} />
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex justify-between items-center" style={{ height: 60 }}>
          {/* Wordmark */}
          <button onClick={() => navigate('landing')} className="flex items-center gap-3 group">
            <Scale style={{ width: 20, height: 20, color: '#D4AF37' }} />
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, fontWeight: 600, color: 'white', letterSpacing: '-0.01em' }}>
              Legal Sahara
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#D4AF37', border: '1px solid #B8960C', padding: '2px 6px', marginLeft: 4 }}>
              AI
            </span>
          </button>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => navigate('landing')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9CA8BC' }}
                    className="hover:text-white transition-colors">Platform</button>
            <button onClick={() => navigate('pricing')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9CA8BC' }}
                    className="hover:text-white transition-colors">Retainers</button>
            <div style={{ width: 1, height: 16, background: '#2A3F5F' }} />
            <StatusDot online={apiOnline} />
            <div style={{ width: 1, height: 16, background: '#2A3F5F' }} />
            {isLoggedIn ? (
              <div className="flex items-center gap-4">
                <button onClick={() => navigate('workspace')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#D4AF37' }}
                        className="hover:text-yellow-200 transition-colors">Workspace</button>
                <button onClick={logout} className="transition-colors" style={{ color: '#6B7F9E' }}>
                  <LogOut style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button onClick={() => navigate('login')} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9CA8BC' }}
                        className="hover:text-white transition-colors">Login</button>
                <button onClick={() => navigate('signup')}
                        style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', background: '#D4AF37', color: '#0C1B33', padding: '8px 16px', fontWeight: 500 }}
                        className="hover:opacity-90 transition-opacity">
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
              <button onClick={logout} className="block w-full text-left text-sm text-red-400">Logout</button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('login')} className="block w-full text-left text-sm" style={{ color: '#9CA8BC' }}>Login</button>
              <button onClick={() => navigate('signup')} className="block w-full text-sm font-bold text-center py-2"
                      style={{ background: '#D4AF37', color: '#0C1B33', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Apply for Access
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );

  // ── Landing Page ─────────────────────────────────────────────────────────────
  const LandingPage = () => (
    <div style={{ background: '#F5F3EE' }}>

      {/* Hero */}
      <div style={{ borderBottom: '1px solid #D9D4C8' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-10" style={{ paddingTop: 80, paddingBottom: 80 }}>
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 24, height: 1, background: '#B8960C' }} />
                Pakistan's First Agentic Legal Intelligence Platform
              </div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(38px, 5vw, 58px)', fontWeight: 700, lineHeight: 1.1, color: '#0C1B33', marginBottom: 24 }}>
                The Standard for<br />
                <em style={{ fontStyle: 'italic', color: '#B8960C' }}>Legal Intelligence</em><br />
                in Pakistan.
              </h1>
              <div style={{ width: 48, height: 3, background: '#0C1B33', marginBottom: 24 }} />
              <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 18, lineHeight: 1.75, color: '#3D3D3D', marginBottom: 36 }}>
                Empowering High Court and Supreme Court advocates with agentic AI. Research PLD and SCMR precedents, brief voluminous case files, and draft court-ready petitions — exported as professionally typeset PDFs.
              </p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => navigate('signup')}
                        style={{ background: '#0C1B33', color: 'white', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 8 }}
                        className="hover:opacity-90 transition-opacity">
                  Access Workspace <ArrowRight style={{ width: 14, height: 14 }} />
                </button>
                <button onClick={() => navigate('pricing')}
                        style={{ background: 'transparent', color: '#0C1B33', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 28px', border: '1px solid #0C1B33' }}
                        className="hover:bg-navy-50 transition-colors">
                  View Retainers
                </button>
              </div>
            </div>
            {/* Stats panel */}
            <div style={{ background: '#0C1B33', padding: '40px 40px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #B8960C, #D4AF37)' }} />
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#D4AF37', marginBottom: 28 }}>
                Platform Statistics
              </div>
              {[
                { n: '10,482', label: 'Judgments Indexed' },
                { n: '5', label: 'Petition Formats Supported' },
                { n: 'PLD / SCMR', label: 'Primary Citation Authority' },
                { n: '< 90s', label: 'Average Draft Generation' },
              ].map((s, i) => (
                <div key={i} style={{ paddingTop: 20, paddingBottom: 20, borderBottom: i < 3 ? '1px solid #1E3A5F' : 'none' }}>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, color: 'white' }}>{s.n}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B7F9E', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      <div style={{ background: 'white', borderBottom: '1px solid #D9D4C8' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-10" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 12 }}>
              Core Capabilities
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, fontWeight: 700, color: '#0C1B33' }}>
              Engineered for the Bar
            </h2>
            <div style={{ width: 40, height: 2, background: '#B8960C', marginTop: 12 }} />
          </div>
          <div className="grid md:grid-cols-3 gap-0" style={{ border: '1px solid #D9D4C8' }}>
            {[
              { icon: BookOpen, title: 'Precedent Research', subtitle: 'Hybrid Retrieval Engine', desc: 'Semantic and BM25 search across 10,000 indexed judgments. Retrieve ratio decidendi with verified citation authority — PLD, SCMR, YLR ranked by binding force.' },
              { icon: FileCheck2, title: 'Case File Briefing', subtitle: 'OCR-Enabled Analysis', desc: 'Upload FIRs, charge sheets, or lower court orders. Receive a structured legal memo covering facts, issues, holding, and ratio decidendi.' },
              { icon: Gavel, title: 'Agentic Drafting', subtitle: 'LangGraph Pipeline + PDF', desc: 'Classifies your matter, detects red flags, retrieves precedents, and formats all five petition types. Exports a court-ready PDF with professional typesetting.' },
            ].map(({ icon: Icon, title, subtitle, desc }, i) => (
              <div key={i} style={{ padding: '36px 32px', borderRight: i < 2 ? '1px solid #D9D4C8' : 'none', background: 'white' }}
                   className="hover:bg-stone-50 transition-colors">
                <div style={{ marginBottom: 20 }}>
                  <Icon style={{ width: 18, height: 18, color: '#B8960C', marginBottom: 16 }} />
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 600, color: '#0C1B33', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9CA8BC' }}>{subtitle}</div>
                </div>
                <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, lineHeight: 1.7, color: '#6B6B6B' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Petition types */}
      <div style={{ borderBottom: '1px solid #D9D4C8' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-10" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 12 }}>
              Auto-Classified from Case Description
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, color: '#0C1B33' }}>
              Supported Petition Types
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-0" style={{ border: '1px solid #D9D4C8' }}>
            {['Habeas Corpus', 'Post-Arrest Bail', 'Pre-Arrest Bail', 'Quashment of FIR', 'Property / Encroachment'].map((t, i) => (
              <div key={i} style={{ padding: '24px 20px', borderRight: i < 4 ? '1px solid #D9D4C8' : 'none', textAlign: 'center', background: 'white' }}>
                <ScrollText style={{ width: 14, height: 14, color: '#B8960C', margin: '0 auto 10px' }} />
                <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#0C1B33', fontWeight: 500 }}>{t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: '#0C1B33' }}>
        <div style={{ height: 2, background: 'linear-gradient(90deg, #B8960C, #D4AF37, #B8960C)' }} />
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Scale style={{ width: 14, height: 14, color: '#D4AF37' }} />
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 14, color: 'white' }}>Legal Sahara</span>
          </div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', color: '#4A5E7A', textAlign: 'center' }}>
            Not a substitute for qualified legal advice. Always verify AI-generated content with a licensed advocate.
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#2A3F5F', letterSpacing: '0.1em' }}>
            2026 LEGAL SAHARA. ALL RIGHTS RESERVED.
          </p>
        </div>
      </div>
    </div>
  );

  // ── Pricing Page ─────────────────────────────────────────────────────────────
  const PricingPage = () => (
    <div style={{ background: '#F5F3EE', minHeight: '90vh' }}>
      <div className="max-w-5xl mx-auto px-6 lg:px-10" style={{ paddingTop: 64, paddingBottom: 80 }}>
        <div style={{ marginBottom: 56, borderBottom: '1px solid #D9D4C8', paddingBottom: 32 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 12 }}>
            Transparent Licensing
          </div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 38, fontWeight: 700, color: '#0C1B33' }}>
            Software Retainers
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-0" style={{ border: '1px solid #D9D4C8' }}>
          {[
            { name: 'Academic', price: '0', period: 'Free tier', desc: 'For law students and junior associates beginning practice.', features: ['5 Precedent Queries / month', 'Standard Drafting Assistant', 'Basic Text Summarization'], cta: 'Get Started' },
            { name: 'Advocate Pro', price: '2,500', period: 'Per month', desc: 'For practicing High Court advocates in active chambers.', features: ['250 Precedent Queries / month', 'Full PDF Briefing Engine', 'Court-Ready PDF Export', 'Priority Agent Processing'], cta: 'Select Pro', highlight: true },
            { name: 'Chamber', price: '10,000', period: 'Per month', desc: 'For established law chambers with multiple practitioners.', features: ['Unlimited Agent Usage', 'Custom Firm Precedent Upload', 'Multi-user Access (up to 5)', 'Dedicated Legal Engineer'], cta: 'Contact Us' },
          ].map((plan, i) => (
            <div key={i} style={{
              padding: '36px 32px',
              borderRight: i < 2 ? '1px solid #D9D4C8' : 'none',
              background: plan.highlight ? '#0C1B33' : 'white',
              position: 'relative',
            }}>
              {plan.highlight && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #B8960C, #D4AF37)' }} />}
              <div style={{ marginBottom: 24 }}>
                {plan.highlight && (
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#D4AF37', border: '1px solid #B8960C', padding: '3px 8px', display: 'inline-block', marginBottom: 12 }}>
                    Most Popular
                  </div>
                )}
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: plan.highlight ? 'white' : '#0C1B33', marginBottom: 4 }}>{plan.name}</h3>
                <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 14, color: plan.highlight ? '#6B7F9E' : '#9CA8BC', marginBottom: 20 }}>{plan.desc}</p>
                <div style={{ paddingBottom: 20, borderBottom: `1px solid ${plan.highlight ? '#1E3A5F' : '#D9D4C8'}`, marginBottom: 20 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: plan.highlight ? '#6B7F9E' : '#9CA8BC' }}>Rs. </span>
                  <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 40, fontWeight: 700, color: plan.highlight ? 'white' : '#0C1B33' }}>{plan.price}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: plan.highlight ? '#4A5E7A' : '#B8B0A0', marginLeft: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>/{plan.period}</span>
                </div>
              </div>
              <ul style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {plan.features.map((f, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: plan.highlight ? '#C8D4E0' : '#3D3D3D', lineHeight: 1.5 }}>
                    <CheckCircle2 style={{ width: 13, height: 13, color: plan.highlight ? '#D4AF37' : '#B8960C', flexShrink: 0, marginTop: 3 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => navigate('signup')}
                      style={{
                        width: '100%', padding: '12px 0',
                        fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                        background: plan.highlight ? '#D4AF37' : '#0C1B33',
                        color: plan.highlight ? '#0C1B33' : 'white',
                      }}
                      className="hover:opacity-90 transition-opacity">
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
    <div style={{ background: '#F5F3EE', minHeight: '90vh' }} className="flex items-center justify-center px-4 py-16">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ background: 'white', border: '1px solid #D9D4C8' }}>
          <div style={{ background: '#0C1B33', padding: '32px 40px', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #B8960C, #D4AF37)' }} />
            <Scale style={{ width: 24, height: 24, color: '#D4AF37', margin: '0 auto 12px' }} />
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: 'white' }}>
              {type === 'login' ? 'Chamber Login' : 'Register Profile'}
            </h2>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B7F9E', marginTop: 6 }}>
              Legal Sahara — Restricted Access
            </p>
          </div>
          <div style={{ padding: '36px 40px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {type === 'signup' && (
                <div>
                  <label style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 6 }}>Advocate Name</label>
                  <input type="text" placeholder="e.g. Ali Khan, Advocate"
                         style={{ width: '100%', padding: '10px 14px', border: '1px solid #D9D4C8', background: '#FAFAF8', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, color: '#1A1A1A', outline: 'none' }}
                         onFocus={e => e.target.style.borderColor = '#0C1B33'}
                         onBlur={e => e.target.style.borderColor = '#D9D4C8'} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 6 }}>Professional Email</label>
                <input type="email" placeholder="name@lawfirm.com.pk"
                       style={{ width: '100%', padding: '10px 14px', border: '1px solid #D9D4C8', background: '#FAFAF8', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, color: '#1A1A1A', outline: 'none' }}
                       onFocus={e => e.target.style.borderColor = '#0C1B33'}
                       onBlur={e => e.target.style.borderColor = '#D9D4C8'} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 6 }}>Password</label>
                <input type="password" placeholder="••••••••"
                       style={{ width: '100%', padding: '10px 14px', border: '1px solid #D9D4C8', background: '#FAFAF8', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, color: '#1A1A1A', outline: 'none' }}
                       onFocus={e => e.target.style.borderColor = '#0C1B33'}
                       onBlur={e => e.target.style.borderColor = '#D9D4C8'} />
              </div>
              <button onClick={login}
                      style={{ width: '100%', padding: '13px 0', background: '#0C1B33', color: 'white', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 4 }}
                      className="hover:opacity-90 transition-opacity">
                {type === 'login' ? 'Authenticate' : 'Submit Application'}
              </button>
            </div>
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #E8E4DC', textAlign: 'center' }}>
              <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#6B6B6B' }}>
                {type === 'login' ? 'Not registered? ' : 'Have chamber access? '}
                <button onClick={() => navigate(type === 'login' ? 'signup' : 'login')}
                        style={{ color: '#0C1B33', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  {type === 'login' ? 'Apply here' : 'Log in'}
                </button>
              </p>
              <button onClick={login} style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#B8B0A0', marginTop: 12, textDecoration: 'underline' }}>
                Skip login — demo mode
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Workspace ─────────────────────────────────────────────────────────────────
  const Workspace = () => {
    const navItems = [
      { id: 'drafter',    icon: Edit3,    label: 'Agentic Drafter',  desc: 'Draft petitions' },
      { id: 'rag',        icon: Database, label: 'Precedent Search', desc: 'Case research' },
      { id: 'summarizer', icon: Brain,    label: 'Case Briefing',    desc: 'Summarize documents' },
    ];
    return (
      <div className="flex" style={{ minHeight: 'calc(100vh - 62px)', background: '#F5F3EE' }}>
        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0, background: '#0C1B33', borderRight: '1px solid #1E3A5F', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px 20px', borderBottom: '1px solid #1E3A5F' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4A5E7A', marginBottom: 12 }}>Authenticated User</div>
            <div className="flex items-center gap-3">
              <div style={{ width: 34, height: 34, background: '#D4AF37', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 13, color: '#0C1B33', flexShrink: 0 }}>AK</div>
              <div>
                <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: 'white', fontWeight: 500 }}>Adv. Ali Khan</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#D4AF37' }}>Pro License</p>
              </div>
            </div>
          </div>

          <div style={{ padding: '16px 12px', flex: 1 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4A5E7A', marginBottom: 8, paddingLeft: 8 }}>Legal Agents</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {navItems.map(({ id, icon: Icon, label, desc }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          background: activeTab === id ? '#D4AF37' : 'transparent',
                          borderLeft: activeTab === id ? '2px solid #B8960C' : '2px solid transparent',
                          textAlign: 'left', transition: 'all 0.15s',
                        }}>
                  <Icon style={{ width: 14, height: 14, color: activeTab === id ? '#0C1B33' : '#4A5E7A', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.05em', color: activeTab === id ? '#0C1B33' : '#9CA8BC', fontWeight: activeTab === id ? 500 : 400 }}>{label}</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: activeTab === id ? '#4A3000' : '#2A3F5F', marginTop: 1, letterSpacing: '0.05em' }}>{desc}</p>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          <div style={{ padding: '16px 20px', borderTop: '1px solid #1E3A5F' }}>
            <div className="flex items-center justify-between">
              <StatusDot online={apiOnline} />
              <button onClick={logout} style={{ color: '#2A3F5F' }} className="hover:text-red-400 transition-colors">
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
    const [messages,  setMessages]  = useState([{
      role: 'agent',
      text: 'Counsel, please provide the brief facts of the matter — include the names of the parties, the police station or authority involved, and the nature of the detention or legal issue. I will classify, research precedents, and draft the pleadings.'
    }]);
    const [input,      setInput]      = useState('');
    const [doc,        setDoc]        = useState('');
    const [loading,    setLoading]    = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [copied,     setCopied]     = useState(false);
    const [meta,       setMeta]       = useState(null);
    const [blockReason, setBlockReason] = useState('');
    const [warnings,    setWarnings]    = useState([]);
    const chatEnd     = useRef(null);

    useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const addMsg = (role, text) => setMessages(prev => [...prev, { role, text }]);
    const dropLastN = (n) => setMessages(prev => prev.slice(0, prev.length - n));

    const handleSend = async () => {
      const story = input.trim();
      if (!story || loading) return;
      setBlockReason(''); setWarnings('');
      setInput('');
      addMsg('user', story);
      setLoading(true);
      addMsg('agent', 'Classifying case type and detecting jurisdiction...');
      addMsg('agent', 'Retrieving relevant precedents from indexed judgments...');
      addMsg('agent', 'Drafting petition with applicable legal strategy...');

      try {
        const data = await api.draft(story);

        if (data.status === 'blocked') {
          const reason = data.agent_reply || data.guardrail_summary?.block_reason || 'Your request was blocked. Please revise and try again.';
          dropLastN(3);
          setBlockReason(reason);
          addMsg('blocked', reason);
          setLoading(false);
          return;
        }

        if (data.needs_info) {
          dropLastN(3);
          addMsg('agent', data.agent_reply || 'Please provide more details.');
          setLoading(false);
          return;
        }

        if (data.status === 'error') {
          dropLastN(3);
          addMsg('agent', data.result || 'An error occurred. Please check the backend is running and ChromaDB is populated.');
          setLoading(false);
          return;
        }

        if (data.result) {
          const w = data.guardrail_warnings || [];
          setWarnings(w);
          setDoc(data.result);
          setMeta({
            type:       data.petition_type,
            court:      data.jurisdiction,
            primary:    data.primary_citation,
            supporting: data.supporting_citation,
            score:      data.eval_overall_score,
            flags:      data.red_flags || [],
          });
          dropLastN(3);
          addMsg('agent',
            `${data.petition_type || 'Petition'} drafted for ${data.jurisdiction || 'the relevant court'}.\n` +
            `Primary citation: ${data.primary_citation || 'N/A'} — Quality score: ${(data.eval_overall_score || 0).toFixed(1)}/10` +
            (w.length > 0 ? `\n\n${w.length} notice${w.length > 1 ? 's' : ''} raised — review the advisory banner before filing.` : '') +
            `\n\nReview and edit the document in the panel to the right, then export as a court-ready PDF.`
          );
        } else {
          dropLastN(3);
          addMsg('agent', 'No petition was generated. Please try again with more detail.');
        }
      } catch {
        dropLastN(3);
        addMsg('agent', 'Network error. Please ensure the backend server is running on port 8000.');
      } finally {
        setLoading(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const handleDownloadPdf = async () => {
      if (!doc || pdfLoading) return;
      setPdfLoading(true);
      try {
        const url = await api.draftPdf(doc);
        const a = document.createElement('a');
        a.href = url; a.download = 'legal_petition.pdf'; a.click();
        URL.revokeObjectURL(url);
        addMsg('agent', 'Court-ready PDF downloaded. Please review carefully with your client before filing.');
      } catch (err) {
        addMsg('agent', `PDF generation failed: ${err.message}. Use Export .TXT for a plain-text copy.`);
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
      setMessages([{ role: 'agent', text: 'Counsel, please provide the brief facts of the matter...' }]);
      setDoc(''); setMeta(null); setBlockReason(''); setWarnings([]);
    };

    return (
      <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 62px)' }}>

        {/* LEFT: Chat Console */}
        <div className="flex flex-col" style={{ width: '38%', minWidth: 300, background: 'white', borderRight: '1px solid #D9D4C8' }}>

          {/* Console header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #D9D4C8', background: '#0C1B33', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #B8960C, #D4AF37)' }} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield style={{ width: 14, height: 14, color: '#D4AF37' }} />
                <div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'white' }}>Agent Console</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.08em', color: '#4A5E7A', marginTop: 1 }}>LangGraph Agentic Pipeline</div>
                </div>
              </div>
              <button onClick={clearAll} style={{ color: '#4A5E7A' }} className="hover:text-white transition-colors" title="Clear session">
                <RotateCcw style={{ width: 12, height: 12 }} />
              </button>
            </div>
          </div>

          {/* Meta badges */}
          {meta && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #E8E4DC', display: 'flex', flexWrap: 'wrap', gap: 6, background: '#FAFAF8' }}>
              {[
                { label: meta.type, color: '#0C1B33', bg: '#EEF1F7' },
                { label: meta.court, color: '#6B4A00', bg: '#FDF5DC' },
                meta.score > 0 && { label: `${meta.score.toFixed(1)}/10`, color: '#1A5C2A', bg: '#F0FDF4' },
                meta.flags.length > 0 && { label: `${meta.flags.length} flag${meta.flags.length > 1 ? 's' : ''}`, color: '#7F1D1D', bg: '#FEF2F2' },
              ].filter(Boolean).map((b, i) => (
                <span key={i} style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: b.color, background: b.bg, border: `1px solid ${b.color}30`, padding: '3px 7px' }}>
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {(msg.role === 'agent' || msg.role === 'blocked') && (
                  <div style={{
                    width: 22, height: 22, flexShrink: 0, marginRight: 8, marginTop: 2,
                    background: msg.role === 'blocked' ? '#FEF2F2' : '#0C1B33',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {msg.role === 'blocked'
                      ? <AlertCircle style={{ width: 11, height: 11, color: '#DC2626' }} />
                      : <Scale style={{ width: 11, height: 11, color: '#D4AF37' }} />}
                  </div>
                )}
                <div style={{
                  maxWidth: '82%', padding: '10px 14px',
                  fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.65,
                  whiteSpace: 'pre-line',
                  ...(msg.role === 'user'
                    ? { background: '#0C1B33', color: 'white' }
                    : msg.role === 'blocked'
                      ? { background: '#FEF2F2', border: '1px solid #FCA5A5', borderLeft: '3px solid #DC2626', color: '#7F1D1D' }
                      : { background: '#F5F3EE', border: '1px solid #D9D4C8', borderLeft: '3px solid #0C1B33', color: '#1A1A1A' })
                }}>
                  {msg.role === 'blocked' && (
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#DC2626', marginBottom: 6 }}>
                      Request Blocked
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', color: '#9CA8BC' }}>
                <Loader2 style={{ width: 12, height: 12, color: '#B8960C', animation: 'spin 1s linear infinite' }} />
                Agent processing — this may take 60 to 90 seconds...
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          {/* Input */}
          <div style={{ padding: '14px 16px', borderTop: '1px solid #D9D4C8', background: '#FAFAF8' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea
                value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Describe your matter to the agent (Enter to send, Shift+Enter for new line)..."
                rows={3} disabled={loading}
                style={{
                  flex: 1, padding: '10px 14px', resize: 'none', outline: 'none',
                  border: '1px solid #D9D4C8', background: 'white',
                  fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#1A1A1A',
                  lineHeight: 1.55,
                }}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()}
                      style={{
                        padding: '0 14px', flexShrink: 0,
                        background: loading || !input.trim() ? '#D9D4C8' : '#0C1B33',
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                      }}>
                {loading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Send style={{ width: 14, height: 14 }} />}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Document Editor */}
        <div className="flex-1 flex flex-col" style={{ background: '#EDEAE3', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #D9D4C8', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText style={{ width: 13, height: 13, color: '#B8960C' }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B6B6B' }}>Petition Draft</span>
              {doc && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: '#B8B0A0' }}>{doc.length.toLocaleString()} chars</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={copyToClipboard} disabled={!doc}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B6B6B', border: '1px solid #D9D4C8', padding: '6px 12px', background: 'white', opacity: doc ? 1 : 0.4, cursor: doc ? 'pointer' : 'not-allowed' }}>
                {copied ? <Check style={{ width: 10, height: 10, color: '#16A34A' }} /> : <Copy style={{ width: 10, height: 10 }} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => doc && downloadTxt(doc, 'petition_draft.txt')} disabled={!doc}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B6B6B', border: '1px solid #D9D4C8', padding: '6px 12px', background: 'white', opacity: doc ? 1 : 0.4, cursor: doc ? 'pointer' : 'not-allowed' }}>
                <File style={{ width: 10, height: 10 }} /> .TXT
              </button>
              <button onClick={handleDownloadPdf} disabled={!doc || pdfLoading}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 16px', background: doc && !pdfLoading ? '#0C1B33' : '#D9D4C8', color: doc && !pdfLoading ? 'white' : '#9CA8BC', cursor: doc && !pdfLoading ? 'pointer' : 'not-allowed' }}>
                {pdfLoading ? <><Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> Generating...</> : <><FileDown style={{ width: 10, height: 10 }} /> Export Court PDF</>}
              </button>
            </div>
          </div>

          {/* Block / warning banners */}
          {blockReason && (
            <div style={{ margin: '16px 24px 0', padding: '14px 18px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderLeft: '4px solid #DC2626', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertCircle style={{ width: 14, height: 14, color: '#DC2626', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#DC2626', marginBottom: 4 }}>Request Blocked</div>
                <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#7F1D1D', lineHeight: 1.55 }}>{blockReason}</p>
              </div>
              <button onClick={() => setBlockReason('')} style={{ color: '#FCA5A5', flexShrink: 0 }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          )}

          {warnings.length > 0 && doc && (
            <div style={{ margin: '16px 24px 0', padding: '14px 18px', background: '#FFFBEB', border: '1px solid #FCD34D', borderLeft: '4px solid #B8960C', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertCircle style={{ width: 14, height: 14, color: '#B8960C', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 6 }}>
                  Advisory — {warnings.length} notice{warnings.length > 1 ? 's' : ''} before filing
                </div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {warnings.map((w, i) => (
                    <li key={i} style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#78350F', lineHeight: 1.55, display: 'flex', gap: 8 }}>
                      <span style={{ color: '#B8960C', flexShrink: 0 }}>—</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={() => setWarnings([])} style={{ color: '#FCD34D', flexShrink: 0 }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          )}

          {/* A4 area */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '28px 32px', display: 'flex', justifyContent: 'center', background: '#EDEAE3' }}>
            <div style={{ width: '100%', maxWidth: 800, background: 'white', minHeight: 1123, padding: '72px 72px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: '1px solid #D9D4C8' }}>
              {!doc ? (
                <div style={{ height: '100%', minHeight: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9CA8BC' }}>
                  <div style={{ width: 48, height: 48, border: '1px solid #D9D4C8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                    <FileText style={{ width: 22, height: 22, color: '#D9D4C8' }} />
                  </div>
                  <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, color: '#6B6B6B', marginBottom: 8 }}>Court Petition Will Appear Here</p>
                  <p style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, color: '#B8B0A0', textAlign: 'center', maxWidth: 340, lineHeight: 1.65 }}>
                    Describe your matter in the Agent Console. The petition will appear here for review and editing before PDF export.
                  </p>
                  <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 340 }}>
                    {['Habeas Corpus', 'Post-Arrest Bail', 'Pre-Arrest Bail', 'Quashment'].map(t => (
                      <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E8E4DC', padding: '8px 12px', background: '#FAFAF8' }}>
                        <ScrollText style={{ width: 11, height: 11, color: '#B8B0A0', flexShrink: 0 }} />
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA8BC' }}>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <textarea value={doc} onChange={e => setDoc(e.target.value)}
                          style={{ width: '100%', resize: 'none', outline: 'none', color: '#1A1A1A', lineHeight: 1.85, background: 'transparent', fontFamily: "'Times New Roman', Georgia, serif", fontSize: '12pt', minHeight: 980, border: 'none' }}
                          spellCheck={false} />
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
      <div className="flex-1 overflow-y-auto" style={{ background: '#F5F3EE', padding: '40px 48px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ marginBottom: 36, paddingBottom: 28, borderBottom: '1px solid #D9D4C8' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 10 }}>
              Hybrid Semantic + BM25 Retrieval — 10,482 Judgments
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 30, fontWeight: 700, color: '#0C1B33' }}>
              Precedent Search Engine
            </h2>
          </div>

          <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1px solid #D9D4C8', background: 'white' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ width: 14, height: 14, color: '#B8B0A0', position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
                     placeholder="Search judgments, cite sections, find cases by judge or party..."
                     style={{ width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 14, paddingBottom: 14, outline: 'none', border: 'none', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 17, color: '#1A1A1A', background: 'transparent' }} />
            </div>
            <button onClick={search} disabled={loading || !query.trim()}
                    style={{ padding: '0 24px', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', background: loading || !query.trim() ? '#D9D4C8' : '#0C1B33', color: 'white', flexShrink: 0, transition: 'background 0.15s', border: 'none' }}>
              {loading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : 'Query'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setQuery(ex)}
                      style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B6B6B', border: '1px solid #D9D4C8', padding: '5px 10px', background: 'white', transition: 'all 0.15s' }}
                      className="hover:border-stone-400 hover:text-stone-700">
                {ex}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#FEF2F2', border: '1px solid #FCA5A5', borderLeft: '3px solid #DC2626', padding: '12px 16px', marginBottom: 20, fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#7F1D1D' }}>
              <AlertCircle style={{ width: 14, height: 14, color: '#DC2626', flexShrink: 0, marginTop: 2 }} />{error}
            </div>
          )}

          {result && (
            <div style={{ background: 'white', border: '1px solid #D9D4C8', marginBottom: 28 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #D9D4C8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAF8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileCheck2 style={{ width: 13, height: 13, color: '#B8960C' }} />
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0C1B33' }}>Search Results</span>
                </div>
                <button onClick={() => navigator.clipboard.writeText(result)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA8BC' }}
                        className="hover:text-stone-600 transition-colors">
                  <Copy style={{ width: 10, height: 10 }} /> Copy
                </button>
              </div>
              <div style={{ padding: '24px 20px' }}>
                <pre style={{ fontFamily: "'DM Mono', 'Courier New', monospace", fontSize: 12, color: '#3D3D3D', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{result}</pre>
              </div>
            </div>
          )}

          {!result && !error && !loading && (
            <div style={{ background: 'white', border: '1px solid #D9D4C8', padding: '60px 24px', textAlign: 'center' }}>
              <BookOpen style={{ width: 28, height: 28, color: '#D9D4C8', margin: '0 auto 12px' }} />
              <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: '#6B6B6B', marginBottom: 6 }}>Database Ready</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#B8B0A0' }}>10,482 Judgments Indexed — Awaiting Query</p>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9CA8BC', marginBottom: 8 }}>Recent Queries</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {history.map((h, i) => (
                  <div key={i} onClick={() => { setQuery(h.q); setResult(h.r); }}
                       style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'white', border: '1px solid #D9D4C8', cursor: 'pointer' }}
                       className="hover:bg-stone-50 transition-colors">
                    <Search style={{ width: 11, height: 11, color: '#D9D4C8', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#3D3D3D', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.q}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: '#B8B0A0', flexShrink: 0 }}>{h.ts}</span>
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
    const [file,     setFile]     = useState(null);
    const [result,   setResult]   = useState('');
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef(null);

    const handleFile = (f) => {
      if (!f) return;
      const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/png', 'image/jpeg'];
      if (!allowed.includes(f.type)) { setError('Unsupported file type. Upload PDF, DOCX, TXT, PNG, or JPG.'); return; }
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
      <div className="flex-1 overflow-y-auto" style={{ background: '#F5F3EE', padding: '40px 48px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ marginBottom: 36, paddingBottom: 28, borderBottom: '1px solid #D9D4C8' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8960C', marginBottom: 10 }}>
              AI Extraction — Facts, Issues, Holding, Ratio Decidendi
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 30, fontWeight: 700, color: '#0C1B33' }}>
              Case File Briefing
            </h2>
          </div>

          <div style={{ background: 'white', border: '1px solid #D9D4C8', marginBottom: 20 }}>
            <div
              style={{ padding: '48px 32px', border: `2px dashed ${dragOver ? '#B8960C' : '#D9D4C8'}`, margin: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: dragOver ? '#FFFBEB' : '#FAFAF8', transition: 'all 0.15s' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={e => handleFile(e.target.files[0])} />
              <UploadCloud style={{ width: 28, height: 28, color: file ? '#B8960C' : '#D9D4C8', marginBottom: 14 }} />
              {file ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, color: '#0C1B33', marginBottom: 4 }}>{file.name}</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA8BC' }}>{(file.size / 1024).toFixed(1)} KB — Ready for analysis</p>
                  <button onClick={e => { e.stopPropagation(); setFile(null); }}
                          style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#DC2626', marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, margin: '10px auto 0' }}>
                    <X style={{ width: 10, height: 10 }} /> Remove
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: '#6B6B6B', marginBottom: 6 }}>Drop document here</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#B8B0A0', marginBottom: 14 }}>PDF, DOCX, TXT, PNG, JPG — up to 25 MB</p>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', border: '1px solid #D9D4C8', padding: '8px 16px', color: '#6B6B6B', display: 'inline-block', background: 'white' }}>
                    Browse Files
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div style={{ margin: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '10px 14px', fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, color: '#7F1D1D' }}>
                <AlertCircle style={{ width: 13, height: 13, color: '#DC2626', flexShrink: 0 }} />{error}
              </div>
            )}

            <div style={{ padding: '0 20px 20px' }}>
              <button onClick={submit} disabled={!file || loading}
                      style={{ width: '100%', padding: '13px 0', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', background: !file || loading ? '#D9D4C8' : '#0C1B33', color: !file || loading ? '#9CA8BC' : 'white', border: 'none', cursor: !file || loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s' }}>
                {loading
                  ? <><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Analysing document — may take 60 to 90 seconds...</>
                  : 'Generate Executive Legal Brief'}
              </button>
            </div>
          </div>

          {result && (
            <div style={{ background: 'white', border: '1px solid #D9D4C8' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #D9D4C8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAF8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileCheck2 style={{ width: 13, height: 13, color: '#B8960C' }} />
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0C1B33' }}>Legal Memorandum</span>
                </div>
                <button onClick={() => downloadTxt(result, 'legal_memo.txt')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA8BC' }}
                        className="hover:text-stone-600 transition-colors">
                  <Download style={{ width: 10, height: 10 }} /> Download .TXT
                </button>
              </div>
              <div style={{ padding: '24px 20px' }}>
                <pre style={{ fontFamily: "'DM Mono', 'Courier New', monospace", fontSize: 11, color: '#3D3D3D', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{result}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Router ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EE', color: '#1A1A1A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=DM+Mono:wght@300;400;500&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        button { cursor: pointer; border: none; background: none; }
        textarea, input { font-family: 'EB Garamond', Georgia, serif; }
        ::selection { background: #0C1B33; color: white; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #F5F3EE; }
        ::-webkit-scrollbar-thumb { background: #D9D4C8; }
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
