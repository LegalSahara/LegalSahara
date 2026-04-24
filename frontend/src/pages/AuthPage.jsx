import React, { useState } from 'react';
import { Scale, Loader2 } from 'lucide-react';
import { api } from '../api';

export default function AuthPage({ type, nav, doLogin }) {
  const [email, setEmail]     = useState('');
  const [pass, setPass]       = useState('');
  const [name, setName]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handle = async () => {
    if (!email || !pass || (type === 'signup' && !name)) {
      setError('Fill in all fields.');
      return;
    }
    setLoading(true); setError('');
    try {
      const r = type === 'login'
        ? await api.login(email, pass)
        : await api.signup(email, pass, name);
      if (r.status === 'ok') doLogin(r.user);
      else setError(r.message || 'Authentication failed.');
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth">
      <div className="auth__glow" aria-hidden="true" />
      <div className="auth__card ls-reveal is-in">
        <div className="auth__brand">
          <Scale size={22} strokeWidth={1.75} />
        </div>
        <div className="auth__title">
          <p className="ls-eyebrow" style={{ display: 'block', marginBottom: 8 }}>
            {type === 'login' ? 'Sign in' : 'Create account'}
          </p>
          <h2 className="ls-h3">
            {type === 'login' ? 'Welcome back.' : 'Open your workspace.'}
          </h2>
        </div>

        {error && <div className="auth__error">{error}</div>}

        {type === 'signup' && (
          <div className="auth__field">
            <label className="auth__label">Full name</label>
            <input
              className="auth__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Counsel's full name"
            />
          </div>
        )}

        <div className="auth__field">
          <label className="auth__label">Email</label>
          <input
            className="auth__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@chambers.pk"
            onKeyDown={(e) => e.key === 'Enter' && handle()}
          />
        </div>

        <div className="auth__field">
          <label className="auth__label">Password</label>
          <input
            className="auth__input"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
            onKeyDown={(e) => e.key === 'Enter' && handle()}
          />
        </div>

        <button
          onClick={handle}
          disabled={loading}
          className="btn btn--primary btn--block btn--lg"
          style={{ marginTop: 8 }}>
          {loading ? (
            <><Loader2 size={14} className="ls-spin" /> Processing…</>
          ) : (
            type === 'login' ? 'Sign in' : 'Create account'
          )}
        </button>

        <p className="auth__foot">
          {type === 'login' ? 'No account? ' : 'Have access? '}
          <button onClick={() => nav(type === 'login' ? 'signup' : 'login')}>
            {type === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </section>
  );
}
