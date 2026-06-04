import { useEffect } from 'react';

/**
 * Observes .ls-reveal elements and adds .is-in when they enter the viewport.
 * Pass a dep (e.g. current page) to re-scan when new elements mount.
 */
export function useReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll('.ls-reveal:not(.is-in)');
    if (els.length === 0) return;
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
  }, deps);
}