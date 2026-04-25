import React, { useState, useEffect } from 'react';
import { Search, Loader2, Copy } from 'lucide-react';
import { api } from '../../api';
import GuardrailBanner from '../../components/GuardrailBanner';

const EXAMPLES = [
  'Post-arrest bail Section 302 PPC',
  'Habeas corpus illegal detention',
  'Article 199 quashment mala fide FIR',
  'Cases by Justice Yahya Afridi 2023',
  'Pre-arrest bail extraordinary circumstances',
];

export default function RAGPanel({ session, onSave }) {
  const [query,   setQuery]         = useState(session?.query || '');
  const [result,  setResult]        = useState(session?.result || '');
  const [loading, setLoading]       = useState(false);
  const [blockReason, setBlock]     = useState('');

  const prevSessionId = React.useRef(session?.id || null);

  useEffect(() => {
    if (!session) return;
    if (session.id === prevSessionId.current) return;
    prevSessionId.current = session.id;
    setQuery(session.query || '');
    setResult(session.result || '');
    setBlock('');
  }, [session]);

  const search = async () => {
    if (!query.trim() || loading) return;
    setLoading(true); setBlock('');
    setResult('');
    const q = query.trim();

    try {
      const data = await api.rag(q);
      if (data.status === 'blocked') {
        setBlock(data.result || data.guardrail_summary?.block_reason || 'Blocked.');
        return;
      }
      if (data.status === 'ok') {
        setResult(data.result);
        const sessionData = { query: q, result: data.result };
        try {
          const created = await api.createSession('rag', q.slice(0, 80), sessionData);
          if (created.status === 'ok') {
            onSave({
              id: created.id,
              feature: 'rag',
              label: q,
              ...sessionData,
              ts: new Date(created.created_at).getTime(),
            });
          }
        } catch (e) {
          console.error('Failed to save RAG session:', e);
        }
      } else {
        setBlock(data.result || 'Search failed.');
      }
    } catch {
      setBlock('Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page__inner">
        <div className="page__head ls-reveal is-in">
          <p className="ls-eyebrow">Hybrid semantic + BM25 · 10,482 judgments</p>
          <h2 className="ls-h2">Precedent search.</h2>
        </div>

        <div className="search-bar">
          <div className="search-bar__input-wrap">
            <Search size={16} strokeWidth={1.75} className="search-bar__icon" />
            <input
              className="search-bar__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search judgments, cite sections, find cases by judge or party…"
            />
          </div>
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            className="search-bar__btn">
            {loading ? <Loader2 size={14} className="ls-spin" /> : 'Query'}
          </button>
        </div>

        <div className="examples">
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setQuery(ex)} className="chip chip--action">
              {ex}
            </button>
          ))}
        </div>

        {result && (
          <div className="result-card">
            <div className="result-card__head">
              <p className="ls-eyebrow">Results</p>
              <button
                onClick={() => navigator.clipboard.writeText(result)}
                className="icn-btn">
                <Copy size={12} /> Copy
              </button>
            </div>
            <pre className="result-card__content">{result}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
