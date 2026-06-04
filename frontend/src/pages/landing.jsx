/* global React */
const { useEffect, useRef, useState, useCallback } = React;

/* ═══════════════════════════════════════════════════════════════════════
   SCROLL-REVEAL HOOK — sets .is-in on elements as they enter viewport
   ═══════════════════════════════════════════════════════════════════════ */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.ls-reveal:not(.is-in)');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ═══════════════════════════════════════════════════════════════════════
   COUNT-UP — animates a number from 0 when element scrolls into view
   ═══════════════════════════════════════════════════════════════════════ */
function CountUp({ to, duration = 1600, format = (n) => n.toLocaleString(), suffix = '', prefix = '' }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start = null;
    let raf;
    const animate = (ts) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * to));
      if (t < 1) raf = requestAnimationFrame(animate);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        raf = requestAnimationFrame(animate);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [to, duration]);
  return <span ref={ref}>{prefix}{format(val)}{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════════════════════
   NAV — blur-on-scroll
   ═══════════════════════════════════════════════════════════════════════ */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className={`nav ${scrolled ? 'nav--scrolled' : ''}`}>
      <div className="nav__inner">
        <a className="nav__brand" href="#top">
          <ScaleIcon size={20} />
          <span>Legal Sahara</span>
        </a>
        <div className="nav__links">
          <a href="#product">Product</a>
          <a href="#tools">Tools</a>
          <a href="#precedents">Precedents</a>
          <a href="#pricing">Retainers</a>
        </div>
        <div className="nav__cta">
          <a href="#signin" className="btn btn--ghost">Sign in</a>
          <a href="#apply" className="btn btn--primary">Open workspace</a>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HERO — full-bleed dark with gold glow
   ═══════════════════════════════════════════════════════════════════════ */
function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero__glow" aria-hidden="true" />
      <div className="hero__grid" aria-hidden="true" />
      <div className="hero__inner">
        <p className="ls-eyebrow ls-eyebrow--on-dark ls-reveal">Pakistan's first agentic legal AI</p>
        <h1 className="ls-hero hero__headline ls-reveal ls-reveal--delay-1">
          The standard for<br />
          <em>legal intelligence.</em>
        </h1>
        <p className="hero__sub ls-reveal ls-reveal--delay-2">
          Research PLD and SCMR precedents, brief voluminous case files, and draft
          court-ready petitions in under ninety seconds.
        </p>
        <div className="hero__cta ls-reveal ls-reveal--delay-3">
          <a href="#apply" className="btn btn--primary btn--lg">
            Open workspace <ArrowIcon size={16} />
          </a>
          <a href="#tools" className="btn btn--ghost-dark btn--lg">See how it works</a>
        </div>
      </div>
      <div className="hero__scroll ls-reveal ls-reveal--delay-4" aria-hidden="true">
        <span>Scroll</span>
        <div className="hero__scroll-line" />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STATS — animated counters
   ═══════════════════════════════════════════════════════════════════════ */
function Stats() {
  const stats = [
    { label: 'Judgments indexed', to: 10482, suffix: '+' },
    { label: 'Petition formats', to: 5 },
    { label: 'Avg draft time', to: 87, suffix: 's', prefix: '<' },
    { label: 'Citation authority', text: 'PLD · SCMR' },
  ];
  return (
    <section className="stats">
      <div className="stats__inner">
        {stats.map((s, i) => (
          <div key={i} className={`stats__item ls-reveal ls-reveal--delay-${i}`}>
            <div className="stats__num ls-number">
              {s.text ? s.text :
                <CountUp to={s.to} suffix={s.suffix || ''} prefix={s.prefix || ''} />}
            </div>
            <div className="stats__label ls-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PINNED TOOLS SECTION — sticky copy column, scene changes on scroll
   ═══════════════════════════════════════════════════════════════════════ */
const TOOLS = [
  {
    id: 'draft',
    eyebrow: 'Petition drafter',
    title: 'From one paragraph to a filed-shape petition.',
    desc: 'Describe the matter. The agent classifies jurisdiction, detects red flags, retrieves binding precedents, and returns a petition drafted for your court — ready for review and PDF export.',
    bullets: ['Habeas Corpus', 'Pre-Arrest Bail', 'Post-Arrest Bail', 'Quashment', 'Constitutional'],
    scene: DrafterScene,
  },
  {
    id: 'search',
    eyebrow: 'Precedent search',
    title: 'Hybrid semantic + BM25 across every reported case.',
    desc: 'Query in natural language or by section. Results are ranked by binding force — PLD above SCMR above YLR — with ratio decidendi surfaced at the top of every card.',
    bullets: ['10,482 judgments', 'Citation-authority ranking', 'Filter by bench, year, section'],
    scene: SearchScene,
  },
  {
    id: 'brief',
    eyebrow: 'Case briefing',
    title: 'Voluminous files, one structured memo.',
    desc: 'Upload an FIR, charge-sheet, or lower-court order. Receive a memo covering facts, issues, holding, and ratio — with page-anchored citations back into the source document.',
    bullets: ['FIR', 'Charge sheet', 'Lower-court orders', 'Witness statements'],
    scene: BriefScene,
  },
];

function Tools() {
  const [active, setActive] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const total = container.offsetHeight - window.innerHeight;
      const scrolled = Math.max(0, Math.min(total, -rect.top));
      const progress = total > 0 ? scrolled / total : 0;
      const idx = Math.min(TOOLS.length - 1, Math.floor(progress * TOOLS.length));
      setActive(idx);
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <section className="tools" id="tools" ref={containerRef}>
      <div className="tools__sticky">
        <div className="tools__grid">
          <div className="tools__copy">
            <p className="ls-eyebrow">Three tools · one workspace</p>
            {TOOLS.map((t, i) => (
              <div key={t.id} className={`tools__item ${active === i ? 'is-active' : ''}`}>
                <p className="tools__item-eyebrow ls-label">{t.eyebrow}</p>
                <h3 className="ls-h2 tools__item-title">{t.title}</h3>
                <p className="tools__item-desc">{t.desc}</p>
                <ul className="tools__bullets">
                  {t.bullets.map((b) => (
                    <li key={b}><CheckIcon size={14} />{b}</li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="tools__pager">
              {TOOLS.map((t, i) => (
                <span key={t.id} className={`tools__pager-dot ${active === i ? 'is-active' : ''}`} />
              ))}
            </div>
          </div>
          <div className="tools__scenes">
            {TOOLS.map((t, i) => {
              const Scene = t.scene;
              return (
                <div key={t.id} className={`tools__scene ${active === i ? 'is-active' : ''}`}>
                  <Scene />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Scenes (fake product UI shots) ─────────────────────────────────── */

function DrafterScene() {
  return (
    <div className="scene scene--drafter">
      <div className="scene__chrome">
        <div className="scene__dots"><span /><span /><span /></div>
        <div className="scene__tab">Petition Drafter</div>
      </div>
      <div className="scene__body">
        <div className="scene__bubble scene__bubble--user">
          My client was arrested without FIR at Lahore Cantt PS on Thursday. Seeking habeas corpus before LHC.
        </div>
        <div className="scene__typing">
          <span /><span /><span />
        </div>
        <div className="scene__bubble scene__bubble--agent">
          <div className="scene__badges">
            <span className="chip">Habeas Corpus</span>
            <span className="chip chip--gold">LHC</span>
            <span className="chip chip--ok">8.4 / 10</span>
          </div>
          Classifying jurisdiction · retrieving 3 precedents · drafting under Article 199…
        </div>
        <div className="scene__doc">
          <div className="scene__doc-head">
            <span className="ls-label">PETITION · HABEAS CORPUS</span>
            <span className="ls-label">DRAFT v1</span>
          </div>
          <div className="scene__doc-line" style={{ width: '92%' }} />
          <div className="scene__doc-line" style={{ width: '80%' }} />
          <div className="scene__doc-line" style={{ width: '95%' }} />
          <div className="scene__doc-line" style={{ width: '70%' }} />
          <div className="scene__doc-line" style={{ width: '88%' }} />
          <div className="scene__doc-line" style={{ width: '40%' }} />
        </div>
      </div>
    </div>
  );
}

function SearchScene() {
  const rows = [
    { cite: 'PLD 2023 SC 451', weight: 'SC', court: 'Supreme Court', match: 98 },
    { cite: 'SCMR 2022 887',   weight: 'SC', court: 'Supreme Court', match: 94 },
    { cite: 'PLD 2021 Lah 102',weight: 'HC', court: 'Lahore High Court', match: 89 },
    { cite: 'YLR 2020 2341',   weight: 'HC', court: 'Sindh High Court', match: 82 },
  ];
  return (
    <div className="scene scene--search">
      <div className="scene__chrome">
        <div className="scene__dots"><span /><span /><span /></div>
        <div className="scene__tab">Precedent Search</div>
      </div>
      <div className="scene__body">
        <div className="scene__search">
          <SearchIcon size={14} />
          <span>post-arrest bail section 302 PPC mala fide</span>
          <span className="scene__search-kbd">↵</span>
        </div>
        <div className="scene__results">
          {rows.map((r, i) => (
            <div key={i} className="scene__result" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="scene__result-cite">
                <span className="ls-label">{r.cite}</span>
                <span className={`chip ${r.weight === 'SC' ? 'chip--gold' : ''}`}>{r.weight}</span>
              </div>
              <div className="scene__result-court">{r.court}</div>
              <div className="scene__result-bar">
                <div className="scene__result-bar-fill" style={{ width: `${r.match}%` }} />
              </div>
              <div className="scene__result-match ls-label">{r.match}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BriefScene() {
  return (
    <div className="scene scene--brief">
      <div className="scene__chrome">
        <div className="scene__dots"><span /><span /><span /></div>
        <div className="scene__tab">Case Briefing</div>
      </div>
      <div className="scene__body">
        <div className="scene__upload">
          <FileIcon size={16} />
          <div>
            <div className="scene__upload-name">FIR_No_284_2024.pdf</div>
            <div className="ls-label">42 pages · 3.1 MB</div>
          </div>
          <span className="chip chip--ok">Parsed</span>
        </div>
        <div className="scene__memo">
          {['Facts', 'Issues', 'Holding', 'Ratio decidendi'].map((h, i) => (
            <div key={h} className="scene__memo-block">
              <div className="scene__memo-head ls-label">{h}</div>
              <div className="scene__memo-line" style={{ width: '96%' }} />
              <div className="scene__memo-line" style={{ width: '80%' }} />
              {i < 2 && <div className="scene__memo-line" style={{ width: '88%' }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PETITION TYPES — horizontal scroll-snap showcase
   ═══════════════════════════════════════════════════════════════════════ */
const PETITIONS = [
  { code: '199', title: 'Constitutional', law: 'Article 199', desc: 'Writ jurisdiction for fundamental rights and administrative relief.' },
  { code: 'HC',  title: 'Habeas Corpus', law: 'Art. 199(1)(b)(i)', desc: 'Production of a person in illegal custody before the court.' },
  { code: '498', title: 'Pre-Arrest Bail', law: 'Section 498 CrPC', desc: 'Protective bail granted before arrest in cognizable offences.' },
  { code: '497', title: 'Post-Arrest Bail', law: 'Section 497 CrPC', desc: 'Bail application after arrest; standards vary by bailable / non-bailable.' },
  { code: '561', title: 'Quashment', law: 'Section 561-A CrPC', desc: 'Inherent jurisdiction to quash FIR or proceedings for mala fide.' },
];

function Petitions() {
  return (
    <section className="petitions" id="precedents">
      <div className="petitions__head">
        <p className="ls-eyebrow ls-reveal">Filings supported</p>
        <h2 className="ls-h1 ls-reveal ls-reveal--delay-1">Every petition your chamber files.</h2>
        <p className="ls-lead petitions__lead ls-reveal ls-reveal--delay-2">
          Five statutory formats, pre-configured with the preamble, cause-title, and prayer
          conventions of the High Courts and Supreme Court of Pakistan.
        </p>
      </div>
      <div className="petitions__scroll" role="list">
        <div className="petitions__spacer" />
        {PETITIONS.map((p, i) => (
          <article key={p.code} className="petition" role="listitem" style={{ '--i': i }}>
            <div className="petition__code">{p.code}</div>
            <div className="petition__law ls-label">{p.law}</div>
            <h3 className="petition__title">{p.title}</h3>
            <p className="petition__desc">{p.desc}</p>
            <div className="petition__foot">
              <span>Draft example</span>
              <ArrowIcon size={14} />
            </div>
          </article>
        ))}
        <div className="petitions__spacer" />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DARK MID-SECTION — pull quote / authority statement
   ═══════════════════════════════════════════════════════════════════════ */
function Authority() {
  return (
    <section className="authority">
      <div className="authority__glow" aria-hidden="true" />
      <div className="authority__inner">
        <p className="ls-eyebrow ls-eyebrow--on-dark ls-reveal">Citation authority</p>
        <h2 className="ls-h1 ls-on-dark ls-reveal ls-reveal--delay-1">
          Ranked by binding force,<br />
          not by recency.
        </h2>
        <p className="authority__sub ls-reveal ls-reveal--delay-2">
          Every retrieval surfaces the highest-authority case first.
          <em>PLD</em> above <em>SCMR</em> above <em>YLR</em> — and within each reporter,
          ratio decidendi above obiter.
        </p>
        <div className="authority__ladder">
          {[
            { t: 'PLD', s: 'All Pakistan Legal Decisions · Supreme + High Courts', w: 100 },
            { t: 'SCMR', s: 'Supreme Court Monthly Review', w: 84 },
            { t: 'YLR', s: 'Yearly Law Reporter · High Courts', w: 62 },
            { t: 'MLD', s: 'Monthly Law Digest', w: 46 },
          ].map((row, i) => (
            <div key={row.t} className={`authority__row ls-reveal ls-reveal--delay-${Math.min(4, i+1)}`}>
              <div className="authority__row-head">
                <span className="authority__row-code">{row.t}</span>
                <span className="authority__row-sub">{row.s}</span>
              </div>
              <div className="authority__bar">
                <div className="authority__bar-fill" style={{ width: `${row.w}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PRICING
   ═══════════════════════════════════════════════════════════════════════ */
const PLANS = [
  { name: 'Academic', price: '0', period: '/ month', features: ['5 queries per month', 'Standard drafting', 'Basic summarization'], cta: 'Get started' },
  { name: 'Advocate Pro', price: '2,500', period: '/ month', features: ['250 queries per month', 'PDF briefing engine', 'Court-ready PDF export', 'Priority processing'], cta: 'Select Pro', highlight: true },
  { name: 'Chamber', price: '10,000', period: '/ month', features: ['Unlimited usage', 'Custom precedents', '5 team seats', 'Dedicated support'], cta: 'Contact us' },
];

function Pricing() {
  return (
    <section className="pricing" id="pricing">
      <div className="pricing__head">
        <p className="ls-eyebrow ls-reveal">Software retainers</p>
        <h2 className="ls-h1 ls-reveal ls-reveal--delay-1">Transparent licensing for the bar.</h2>
      </div>
      <div className="pricing__grid">
        {PLANS.map((p, i) => (
          <div key={p.name} className={`plan ${p.highlight ? 'plan--hi' : ''} ls-reveal ls-reveal--delay-${i + 1}`}>
            {p.highlight && <div className="plan__flag ls-label">Most selected</div>}
            <h3 className="plan__name">{p.name}</h3>
            <div className="plan__price">
              <span className="plan__currency">Rs.</span>
              <span className="plan__amt">{p.price}</span>
              <span className="plan__period">{p.period}</span>
            </div>
            <ul className="plan__features">
              {p.features.map((f) => (
                <li key={f}><CheckIcon size={14} />{f}</li>
              ))}
            </ul>
            <a href="#apply" className={`btn ${p.highlight ? 'btn--gold' : 'btn--primary'} btn--block`}>
              {p.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CTA STRIP + FOOTER
   ═══════════════════════════════════════════════════════════════════════ */
function CTA() {
  return (
    <section className="cta">
      <div className="cta__inner ls-reveal">
        <h2 className="ls-h1 ls-on-dark">Draft your first petition tonight.</h2>
        <p className="cta__sub">Sign up in under a minute. No card on file for the Academic tier.</p>
        <div className="cta__row">
          <a href="#apply" className="btn btn--gold btn--lg">Open workspace <ArrowIcon size={16} /></a>
          <a href="#contact" className="btn btn--ghost-dark btn--lg">Talk to us</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <ScaleIcon size={20} />
          <span>Legal Sahara</span>
        </div>
        <div className="footer__cols">
          <div>
            <p className="ls-label">Product</p>
            <a href="#tools">Drafter</a>
            <a href="#tools">Search</a>
            <a href="#tools">Briefing</a>
          </div>
          <div>
            <p className="ls-label">Company</p>
            <a href="#about">About</a>
            <a href="#careers">Careers</a>
            <a href="#contact">Contact</a>
          </div>
          <div>
            <p className="ls-label">Legal</p>
            <a href="#terms">Terms</a>
            <a href="#privacy">Privacy</a>
            <a href="#disclaimer">Disclaimer</a>
          </div>
        </div>
      </div>
      <div className="footer__bottom">
        <span>Not a substitute for qualified legal advice.</span>
        <span>© 2026 Legal Sahara</span>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ICONS — minimal inline lucide-style set
   ═══════════════════════════════════════════════════════════════════════ */
const Ico = ({ size = 16, children, stroke = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const ScaleIcon = (p) => <Ico {...p}><path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></Ico>;
const ArrowIcon = (p) => <Ico {...p}><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></Ico>;
const CheckIcon = (p) => <Ico {...p}><path d="M20 6L9 17l-5-5"/></Ico>;
const SearchIcon = (p) => <Ico {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Ico>;
const FileIcon = (p) => <Ico {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Ico>;

/* ═══════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════ */
function App() {
  useReveal();
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Stats />
        <Tools />
        <Petitions />
        <Authority />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

Object.assign(window, { App });
