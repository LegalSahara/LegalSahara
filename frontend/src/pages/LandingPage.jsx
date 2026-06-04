import React from 'react';
import { ArrowRight, BookOpen, FileCheck2, Gavel, Scale } from 'lucide-react';
import CountUp from '../components/CountUp';

export default function LandingPage({ user, nav }) {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="hero" id="top">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__grid" aria-hidden="true" />
        <div className="hero__inner">
          <p className="ls-eyebrow ls-eyebrow--on-dark ls-reveal">
            Pakistan's first agentic legal AI
          </p>
          <h1 className="ls-hero hero__headline ls-reveal ls-reveal--delay-1">
            The standard for<br />
            <em>legal intelligence.</em>
          </h1>
          <p className="hero__sub ls-reveal ls-reveal--delay-2">
            Research PLD and SCMR precedents, brief voluminous case files, and draft
            court-ready petitions in under ninety seconds.
          </p>
          <div className="hero__cta ls-reveal ls-reveal--delay-3">
            <button
              onClick={() => (user ? nav('workspace') : nav('login'))}
              className="btn btn--gold btn--lg">
              {user ? 'Open workspace' : 'Access workspace'}
              <ArrowRight size={16} />
            </button>
            <button onClick={() => nav('pricing')} className="btn btn--ghost-dark btn--lg">
              View retainers
            </button>
          </div>
        </div>
        <div className="hero__scroll ls-reveal ls-reveal--delay-4" aria-hidden="true">
          <span>Scroll</span>
          <div className="hero__scroll-line" />
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <section className="stats">
        <div className="stats__inner">
          {[
            { label: 'Judgments indexed', to: 10482, suffix: '+' },
            { label: 'Petition formats', to: 5 },
            { label: 'Avg draft time', to: 87, suffix: 's', prefix: '<' },
            { label: 'Citation authority', text: 'PLD · SCMR' },
          ].map((s, i) => (
            <div key={i} className={`stats__item ls-reveal ls-reveal--delay-${i + 1}`}>
              <div className="stats__num ls-number">
                {s.text ? s.text : <CountUp to={s.to} suffix={s.suffix || ''} prefix={s.prefix || ''} />}
              </div>
              <div className="stats__label ls-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="features" id="tools">
        <div className="features__head ls-reveal">
          <p className="ls-eyebrow">Three tools. One platform.</p>
          <h2 className="ls-h1">
            Everything a petition needs,<br />in a single workspace.
          </h2>
        </div>
        <div className="features__grid">
          {[
            {
              icon: BookOpen,
              title: 'Precedent research',
              desc: 'Hybrid semantic and BM25 search across 10,000+ indexed judgments. Retrieve ratio decidendi with verified citation authority — PLD, SCMR, YLR ranked by binding force.',
            },
            {
              icon: FileCheck2,
              title: 'Case file briefing',
              desc: 'Upload FIRs, charge sheets, or lower court orders. Receive a structured legal memo covering facts, issues, holding, and ratio decidendi.',
            },
            {
              icon: Gavel,
              title: 'Petition drafting',
              desc: 'Classifies your matter, detects red flags, retrieves precedents, and formats all five petition types. Exports a court-ready PDF.',
            },
          ].map(({ icon: Icon, title, desc }, i) => (
            <div key={i} className={`feature-row ls-reveal ls-reveal--delay-${i + 1}`}>
              <div className="feature-row__icon">
                <Icon size={26} strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="feature-row__title">{title}</h3>
                <p className="feature-row__desc">{desc}</p>
              </div>
              <ArrowRight size={20} strokeWidth={1.75} className="feature-row__arrow" />
            </div>
          ))}
        </div>
      </section>

      {/* ── Authority (dark pull quote) ──────────────────────────── */}
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
            <em> PLD</em> above <em>SCMR</em> above <em>YLR</em> — and within each reporter,
            ratio decidendi above obiter.
          </p>
          <div className="authority__ladder">
            {[
              { t: 'PLD',  s: 'All Pakistan Legal Decisions · Supreme + High Courts', w: 100 },
              { t: 'SCMR', s: 'Supreme Court Monthly Review',                          w: 84  },
              { t: 'YLR',  s: 'Yearly Law Reporter · High Courts',                     w: 62  },
              { t: 'MLD',  s: 'Monthly Law Digest',                                    w: 46  },
            ].map((row, i) => (
              <div
                key={row.t}
                className={`authority__row ls-reveal ls-reveal--delay-${Math.min(4, i + 1)}`}>
                <div className="authority__row-head">
                  <span className="authority__row-code">{row.t}</span>
                  <span className="authority__row-sub">{row.s}</span>
                </div>
                <div className="authority__bar">
                  <div
                    className="authority__bar-fill"
                    style={{ width: `${row.w}%`, animationDelay: `${i * 120}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="cta">
        <div className="cta__inner ls-reveal">
          <h2 className="ls-h1 ls-on-dark">Draft your first petition tonight.</h2>
          <p className="cta__sub">
            Sign up in under a minute. No card on file for the Academic tier.
          </p>
          <div className="cta__row">
            <button
              onClick={() => (user ? nav('workspace') : nav('signup'))}
              className="btn btn--gold btn--lg">
              {user ? 'Open workspace' : 'Create account'}
              <ArrowRight size={16} />
            </button>
            <button onClick={() => nav('pricing')} className="btn btn--ghost-dark btn--lg">
              View retainers
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="footer__inner">
          <div>
            <div className="footer__brand">
              <Scale size={20} strokeWidth={1.75} />
              <span>Legal Sahara</span>
            </div>
          </div>
          <div className="footer__cols">
            <div>
              <p className="ls-label">Product</p>
              <button onClick={() => nav('workspace')}>Drafter</button>
              <button onClick={() => nav('workspace')}>Search</button>
              <button onClick={() => nav('workspace')}>Briefing</button>
            </div>
            <div>
              <p className="ls-label">Access</p>
              <button onClick={() => nav('login')}>Sign in</button>
              <button onClick={() => nav('signup')}>Create account</button>
              <button onClick={() => nav('pricing')}>Retainers</button>
            </div>
            <div>
              <p className="ls-label">Legal</p>
              <span style={{ fontSize: 14, color: 'var(--ink-500)' }}>Terms</span>
              <span style={{ fontSize: 14, color: 'var(--ink-500)' }}>Privacy</span>
              <span style={{ fontSize: 14, color: 'var(--ink-500)' }}>Disclaimer</span>
            </div>
          </div>
        </div>
        <div className="footer__bottom">
          <span>Not a substitute for qualified legal advice.</span>
          <span>© 2026 Legal Sahara</span>
        </div>
      </footer>
    </>
  );
}
