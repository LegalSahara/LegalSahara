import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Loader2, Download, AlertCircle, FileX } from 'lucide-react';
import { api, downloadTxt, formatTime } from '../../api';
import GuardrailBanner from '../../components/GuardrailBanner';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
];

const ACCEPTED_DOC_TYPES = [
  'Court opinions & judgments',
  'Petitions & appeals',
  'Contracts & agreements',
  'Statutes & regulations',
  'Affidavits & sworn statements',
  'Supreme Court filings',
];

// Strips the backend-formatted message down to just the core reason sentence
function extractCleanReason(raw) {
  if (!raw) return '';
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l =>
      l.length > 0 &&
      !l.startsWith('•') &&
      !l.toLowerCase().startsWith('accepted document') &&
      !l.toLowerCase().startsWith('please upload') &&
      !l.toLowerCase().startsWith('this document cannot be processed')
    )
    .join(' ')
    .trim();
}

export default function SummaryPanel({ session, onSave }) {
  const [file,        setFile]     = useState(null);
  const [result,      setResult]   = useState(session?.result || '');
  const [loading,     setLoading]  = useState(false);
  const [blockReason, setBlock]    = useState('');
  const [dragOver,    setDragOver] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (session) {
      setResult(session.result);
      setBlock('');
      setFile(null);
    } else {
      setResult('');
    }
  }, [session]);

  const handleFile = (f) => {
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setBlock('Unsupported type. Use PDF, DOCX, TXT, PNG, or JPG.');
      return;
    }
    setFile(f); setBlock(''); setResult('');
  };

  const submit = async () => {
    if (!file || loading) return;
    setLoading(true); setBlock(''); setResult('');
    try {
      const data = await api.summarize(file);
      if (data.status === 'blocked') {
        setBlock(data.guardrail_blocked_reason || 'Document blocked.');
        return;
      }
      if (data.status === 'ok') {
        setResult(data.result);
        const sessionData = { filename: file.name, result: data.result };
        try {
          const created = await api.createSession('summarizer', file.name, sessionData);
          console.log('Summary session create response:', created);
          if (created.status === 'ok') {
            onSave({
              id: created.id,
              feature: 'summarizer',
              label: file.name,
              ...sessionData,
              ts: new Date(created.created_at).getTime(),
            });
          }
        } catch (e) {
          console.error('Failed to save summary session:', e);
        }
      } else {
        setBlock(data.result || 'Summarization failed.');
      }
    } catch {
      setBlock('Network error.');
    } finally {
      setLoading(false);
    }
  };

  const resultFilename = session
    ? `${session.filename.replace(/\.[^.]+$/, '')}_memo.txt`
    : 'legal_memo.txt';

  const cleanReason = extractCleanReason(blockReason);

  return (
    <div className="page">
      <div className="page__inner">
        <div className="page__head ls-reveal is-in">
          <p className="ls-eyebrow">AI extraction · Facts · Issues · Holding · Ratio</p>
          <h2 className="ls-h2">Case file briefing.</h2>
        </div>

        {/* Upload zone only shown when not viewing a past session */}
        {!session && (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files[0]);
              }}
              className={`upload ${dragOver ? 'upload--drag' : ''} ${file ? 'upload--has-file' : ''}`}>
              <input
                ref={fileRef}
                type="file"
                style={{ display: 'none' }}
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <div className="upload__icon">
                <UploadCloud size={24} strokeWidth={1.75} />
              </div>
              {file ? (
                <div className="upload__main">
                  <p className="upload__main-title">{file.name}</p>
                  <p className="upload__main-sub">{(file.size / 1024).toFixed(1)} KB · Ready</p>
                </div>
              ) : (
                <div className="upload__main">
                  <p className="upload__main-title">Drop a legal document, or click to browse</p>
                  <p className="upload__main-sub">PDF · DOCX · TXT · PNG · JPG — up to 25 MB</p>
                </div>
              )}
              {file && (
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="upload__remove">
                  Remove
                </button>
              )}
            </div>

            {/* ── Structured blocked banner ── */}
            {blockReason && (
              <div className="guardrail guardrail--block" style={{ marginTop: 16 }}>

                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <FileX size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                  <span className="guardrail__title" style={{ margin: 0 }}>
                    Document Not Accepted
                  </span>
                </div>

                {/* Clean reason from backend */}
                {cleanReason && (
                  <p className="guardrail__body" style={{ marginBottom: 14 }}>
                    {cleanReason}
                  </p>
                )}

                {/* Divider + accepted types grid */}
                <div style={{
                  borderTop: '1px solid rgba(208,52,44,0.18)',
                  paddingTop: 12,
                  marginTop: 2,
                }}>
                  <p style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--danger)',
                    marginBottom: 10,
                    opacity: 0.8,
                  }}>
                    Accepted document types
                  </p>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '7px 20px',
                  }}>
                    {ACCEPTED_DOC_TYPES.map((t, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        fontSize: 13,
                        color: '#7F1D1D',
                        lineHeight: 1.4,
                      }}>
                        <span style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: 'var(--danger)',
                          opacity: 0.45,
                          flexShrink: 0,
                        }} />
                        {t}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => setBlock('')}
                  className="guardrail__dismiss"
                  style={{ marginTop: 12 }}>
                  Dismiss
                </button>

              </div>
            )}

            <button
              onClick={submit}
              disabled={!file || loading}
              className="btn btn--primary btn--lg"
              style={{ marginBottom: 40 }}>
              {loading ? (
                <><Loader2 size={14} className="ls-spin" /> Analysing · 60–90s</>
              ) : (
                'Generate legal brief'
              )}
            </button>
          </>
        )}

        {result && (
          <div className="result-card">
            <div className="result-card__head">
              <div>
                <p className="ls-eyebrow">
                  {session ? session.filename : 'Legal memorandum'}
                </p>
                {session && (
                  <p className="ls-small" style={{ marginTop: 4 }}>
                    {formatTime(session.ts)}
                  </p>
                )}
              </div>
              <button
                onClick={() => downloadTxt(result, resultFilename)}
                className="icn-btn">
                <Download size={12} /> Download
              </button>
            </div>
            <pre className="result-card__content">{result}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
