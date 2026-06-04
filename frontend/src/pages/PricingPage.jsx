import React from 'react';
import { CheckSmall } from '../components/icons';

const PLANS = [
  {
    name: 'Academic',
    price: '0',
    period: '/ month',
    features: ['5 queries per month', 'Standard drafting', 'Basic summarization'],
    cta: 'Get started',
  },
  {
    name: 'Advocate Pro',
    price: '2,500',
    period: '/ month',
    features: [
      '250 queries per month',
      'PDF briefing engine',
      'Court-ready PDF export',
      'Priority processing',
    ],
    cta: 'Select Pro',
    highlight: true,
  },
  {
    name: 'Chamber',
    price: '10,000',
    period: '/ month',
    features: ['Unlimited usage', 'Custom precedents', '5 team seats', 'Dedicated support'],
    cta: 'Contact us',
  },
];

export default function PricingPage({ nav }) {
  return (
    <section className="pricing" style={{ paddingTop: 160 }}>
      <div className="pricing__head ls-reveal">
        <p className="ls-eyebrow">Software retainers</p>
        <h2 className="ls-h1">
          Transparent licensing<br />for the bar.
        </h2>
      </div>
      <div className="pricing__grid">
        {PLANS.map((p, i) => (
          <div
            key={p.name}
            className={`plan ${p.highlight ? 'plan--hi' : ''} ls-reveal ls-reveal--delay-${i + 1}`}>
            {p.highlight && <div className="plan__flag ls-label">Most selected</div>}
            <h3 className="plan__name">{p.name}</h3>
            <div className="plan__price">
              <span className="plan__currency">Rs.</span>
              <span className="plan__amt">{p.price}</span>
              <span className="plan__period">{p.period}</span>
            </div>
            <ul className="plan__features">
              {p.features.map((f) => (
                <li key={f}>
                  <CheckSmall size={14} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => nav('signup')}
              className={`btn ${p.highlight ? 'btn--gold' : 'btn--primary'} btn--block btn--lg`}>
              {p.cta}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
