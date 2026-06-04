import React from 'react';

export default function GuardrailBanner({ severity, message, warnings = [], onDismiss }) {
  if (!message && warnings.length === 0) return null;
  const isBlock = severity === 'block';
  return (
    <div className={`guardrail ${isBlock ? 'guardrail--block' : 'guardrail--warn'}`}>
      <div className="guardrail__title">
        {isBlock ? 'Request blocked' : `${warnings.length} notice${warnings.length !== 1 ? 's' : ''}`}
      </div>
      {message && <p className="guardrail__body" style={{ margin: 0 }}>{message}</p>}
      {warnings.map((w, i) => (
        <p key={i} className="guardrail__body" style={{ margin: '4px 0 0' }}>— {w}</p>
      ))}
      {onDismiss && (
        <button onClick={onDismiss} className="guardrail__dismiss">Dismiss</button>
      )}
    </div>
  );
}
