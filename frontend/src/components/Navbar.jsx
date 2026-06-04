import React from 'react';
import { Scale, LogOut } from 'lucide-react';
import { useScrolled } from '../hooks/useScrolled';

export default function Navbar({ page, user, apiOnline, nav, doLogout }) {
  const scrolled = useScrolled(24);

  // Only the landing hero is dark. Everywhere else the nav is solid white.
  const navClass =
    page === 'landing'
      ? `nav ${scrolled ? 'nav--scrolled' : ''}`
      : 'nav nav--solid';

  return (
    <nav className={navClass}>
      <div className="nav__inner">
        <button className="nav__brand" onClick={() => nav('landing')}>
          <Scale size={20} strokeWidth={1.75} />
          <span>Legal Sahara</span>
        </button>

        <div className="nav__links">
          {user ? (
            <button onClick={() => nav('workspace')}>Workspace</button>
          ) : (
            <>
              <button onClick={() => nav('landing')}>Product</button>
              <button onClick={() => nav('pricing')}>Retainers</button>
            </>
          )}
        </div>

        <div className="nav__cta">
          <span className="nav__status" aria-live="polite">
            <span
              className="nav__status-dot"
              style={{ background: apiOnline ? 'var(--ok)' : 'var(--danger)' }}
            />
            {apiOnline ? 'Online' : 'Offline'}
          </span>
          {user ? (
            <>
              <button onClick={() => nav('workspace')} className="btn btn--ghost">
                Workspace
              </button>
              <button onClick={doLogout} className="btn btn--primary">
                <LogOut size={14} /> Sign out
              </button>
            </>
          ) : (
            <>
              <button onClick={() => nav('login')} className="btn btn--ghost">
                Sign in
              </button>
              <button onClick={() => nav('signup')} className="btn btn--primary">
                Open workspace
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
