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
  const [evalScores, setEvalScores] = useState(null);
  const [query,   setQuery]         = useState(session?.query || '');
  const [result,  setResult]        = useState(session?.result || '');
  const [loading, setLoading]       = useState(false);
  const [blockReason, setBlock]     = useState('');
  const [warnings, setWarnings]     = useState([]);

  useEffect(() => {
    if (session) {
      setQuery(session.query);
      setResult(session.result);
      setBlock('');
      setWarnings([]);
    }
  }, [session]);

  const search = async () => {
    if (!query.trim() || loading) return;
    setLoading(true); setBlock(''); setWarnings([]);
    setResult(''); setEvalScores(null);
    const q = query.trim();

    try {
      const data = await api.rag(q);
      if (data.status === 'blocked') {
        setBlock(data.result || data.guardrail_summary?.block_reason || 'Blocked.');
        return;
      }
      if (data.status === 'ok') {
        setResult(data.result);
        if (data.eval_scores && Object.keys(data.eval_scores).length > 0) {
          setEvalScores(data.eval_scores);
        }
        const w = data.guardrail_warnings || [];
        setWarnings(w);
        const sessionData = { query: q, result: data.result };
        try {
          const created = await api.createSession('rag', q.slice(0, 80), sessionData);
          console.log('RAG session create response:', created);
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

        {blockReason && (
          <GuardrailBanner severity="block" message={blockReason} onDismiss={() => setBlock('')} />
        )}
        {warnings.length > 0 && (
          <GuardrailBanner severity="warn" warnings={warnings} onDismiss={() => setWarnings([])} />
        )}

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

            {evalScores && Object.keys(evalScores).length > 0 && (
              <div className="eval-grid">
                {[
                  { label: 'Retrieval',    value: `${evalScores.retrieval_score}%` },
                  { label: 'Sources',      value: evalScores.sources_matched },
                  { label: 'Faithfulness', value: `${evalScores.faithfulness}/10` },
                  { label: 'Relevance',    value: `${evalScores.relevance}/10` },
                  { label: 'Completeness', value: `${evalScores.completeness}/10` },
                ].map(({ label, value }) => (
                  <div key={label} className="eval-cell">
                    <div className="eval-cell__label">{label}</div>
                    <div className="eval-cell__value">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
