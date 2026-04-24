import React, { useState, useRef, useEffect } from 'react';
import {
  Scale, Shield, FileText, Send, Loader2,
  Copy, Check, File, FileDown,
} from 'lucide-react';
import { api, downloadTxt } from '../../api';
import GuardrailBanner from '../../components/GuardrailBanner';

export default function DrafterPanel({ session, onSave, onUpdate }) {
  const [messages, setMessages]     = useState(
    session?.messages || [
      {
        role: 'agent',
        text: 'Counsel, please describe the matter — include the names of the parties, the police station or authority involved, and the nature of the legal issue.',
      },
    ],
  );
  const [input, setInput]           = useState('');
  const [doc, setDoc]               = useState(session?.doc || '');
  const [loading, setLoading]       = useState(false);
  const [pdfLoading, setPdfLoad]    = useState(false);
  const [copied, setCopied]         = useState(false);
  const [meta, setMeta]             = useState(session?.meta || null);
  const [blockReason, setBlock]     = useState('');
  const [warnings, setWarnings]     = useState([]);
  const sessionId = useRef(session?.id || null);
  const chatEnd   = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDocChange = (val) => {
    setDoc(val);
    if (sessionId.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate(sessionId.current, { doc: val });
      }, 1500);
    }
  };

  const addMsg    = (role, text) => setMessages((p) => [...p, { role, text }]);
  const dropLast3 = () => setMessages((p) => p.slice(0, p.length - 3));

  const handleSend = async () => {
    const story = input.trim();
    if (!story || loading) return;
    setBlock(''); setWarnings([]); setInput('');
    const newUserMsg = { role: 'user', text: story };
    setMessages((p) => [...p, newUserMsg]);
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
      if (data.needs_info) {
        dropLast3();
        addMsg('agent', data.agent_reply || 'Please provide more details.');
        return;
      }
      if (data.status === 'error') {
        dropLast3();
        addMsg('agent', `⚠ ${data.result}`);
        return;
      }

      if (data.result) {
        const w = data.guardrail_warnings || [];
        setWarnings(w); setDoc(data.result);
        const m = {
          type:    data.petition_type,
          court:   data.jurisdiction,
          primary: data.primary_citation,
          score:   data.eval_overall_score,
          flags:   data.red_flags || [],
        };
        setMeta(m);
        dropLast3();
        const successMsg =
          `${data.petition_type || 'Petition'} drafted for ${data.jurisdiction || 'the court'}.\n` +
          `Citation: ${data.primary_citation || 'N/A'} · Score: ${(data.eval_overall_score || 0).toFixed(1)}/10` +
          `${w.length ? `\n\n${w.length} notice(s) — review before filing.` : ''}\n\n` +
          `Review the draft on the right, then export as PDF.`;
        const successMsgObj = { role: 'agent', text: successMsg };
        setMessages((p) => [...p, successMsgObj]);

        if (sessionId.current) {
          const allMessages = [...messages, newUserMsg, successMsgObj];
          const updatedData = { messages: allMessages, doc: data.result, meta: m };
          onUpdate(sessionId.current, updatedData);
        } else {
          const allMessages = [...messages, newUserMsg, successMsgObj];
          const sessionData = {
            messages: allMessages.map((msg) => ({ role: msg.role, text: msg.text })),
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
      } else {
        dropLast3();
        addMsg('agent', '⚠ No petition generated. Try again with more detail.');
      }
    } catch {
      dropLast3();
      addMsg('agent', '❌ Network error. Check backend.');
    } finally {
      setLoading(false);
    }
  };

  const handlePdf = async () => {
    if (!doc || pdfLoading) return;
    setPdfLoad(true);
    try {
      const url = await api.draftPdf(doc);
      const a = document.createElement('a');
      a.href = url; a.download = 'legal_petition.pdf'; a.click();
      URL.revokeObjectURL(url);
      addMsg('agent', 'PDF downloaded. Review carefully before filing.');
    } catch (e) {
      addMsg('agent', `⚠ PDF failed: ${e.message}`);
    } finally {
      setPdfLoad(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(doc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="draft">
      {/* ═══ Chat pane ═══ */}
      <div className="draft__chat">
        <div className="draft__chat-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={16} strokeWidth={1.75} style={{ color: 'var(--gold-400)' }} />
            <div>
              <div className="draft__chat-head-title">Agent console</div>
              <div className="draft__chat-head-sub">LangGraph · Agentic pipeline</div>
            </div>
          </div>
        </div>

        {meta && (
          <div className="draft__meta">
            {meta.type && <span className="chip">{meta.type}</span>}
            {meta.court && <span className="chip chip--gold">{meta.court}</span>}
            {meta.score > 0 && <span className="chip chip--ok">{meta.score.toFixed(1)}/10</span>}
            {meta.flags?.length > 0 && (
              <span className="chip chip--danger">
                {meta.flags.length} flag{meta.flags.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <div className="draft__chat-body">
          {messages.map((msg, i) => (
            <div key={i} className={`msg msg--${msg.role}`}>
              {msg.role !== 'user' && (
                <div className="msg__avatar">
                  <Scale size={14} strokeWidth={1.75} />
                </div>
              )}
              <div className="msg__bubble">
                {msg.role === 'blocked' && (
                  <div className="msg__blocked-label">Request blocked</div>
                )}
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="draft__typing">
              <span className="draft__typing-dots"><span /><span /><span /></span>
              Processing · 60–90s
            </div>
          )}
          <div ref={chatEnd} />
        </div>

        <div className="draft__chat-foot">
          <div className="draft__compose">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Describe your case… (Enter to send)"
              rows={3}
              disabled={loading}
            />
            <button
              className="draft__send"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send">
              {loading ? <Loader2 size={16} className="ls-spin" /> : <Send size={16} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Document pane ═══ */}
      <div className="draft__doc">
        <div className="draft__doc-head">
          <div className="draft__doc-title">
            <FileText size={14} strokeWidth={1.75} />
            <span>Petition draft</span>
            {doc && <span className="draft__doc-count">{doc.length.toLocaleString()} chars</span>}
          </div>
          <div className="draft__doc-actions">
            <button onClick={handleCopy} disabled={!doc} className="icn-btn">
              {copied ? (
                <><Check size={12} style={{ color: 'var(--ok)' }} /> Copied</>
              ) : (
                <><Copy size={12} /> Copy</>
              )}
            </button>
            <button
              onClick={() => doc && downloadTxt(doc, 'petition_draft.txt')}
              disabled={!doc}
              className="icn-btn">
              <File size={12} /> TXT
            </button>
            <button
              onClick={handlePdf}
              disabled={!doc || pdfLoading}
              className="btn btn--primary btn--sm">
              {pdfLoading ? (
                <><Loader2 size={12} className="ls-spin" /> Generating…</>
              ) : (
                <><FileDown size={12} /> Export PDF</>
              )}
            </button>
          </div>
        </div>

        {blockReason && (
          <div style={{ padding: '16px 32px 0' }}>
            <GuardrailBanner
              severity="block"
              message={blockReason}
              onDismiss={() => setBlock('')}
            />
          </div>
        )}
        {warnings.length > 0 && doc && (
          <div style={{ padding: '16px 32px 0' }}>
            <GuardrailBanner
              severity="warn"
              warnings={warnings}
              onDismiss={() => setWarnings([])}
            />
          </div>
        )}

        <div className="draft__doc-body">
          {!doc ? (
            <div className="draft__doc-empty">
              <h3 className="draft__doc-empty-title">Your petition will appear here.</h3>
              <p className="draft__doc-empty-desc">
                Describe your matter in the chat on the left. The draft will be generated
                and rendered here for review and editing.
              </p>
              <div className="draft__doc-empty-tags">
                {['Habeas Corpus', 'Post-Arrest Bail', 'Pre-Arrest Bail', 'Quashment', 'Constitutional'].map((t) => (
                  <span key={t} className="chip">{t}</span>
                ))}
              </div>
            </div>
          ) : (
            <textarea
              value={doc}
              onChange={(e) => handleDocChange(e.target.value)}
              className="draft__doc-textarea"
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
