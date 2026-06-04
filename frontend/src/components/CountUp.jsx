import React, { useRef, useState, useEffect } from 'react';

export default function CountUp({ to, duration = 1600, suffix = '', prefix = '' }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start = null;
    let raf = null;

    const animate = (ts) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * to));
      if (t < 1) raf = requestAnimationFrame(animate);
    };

    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        raf = requestAnimationFrame(animate);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [to, duration]);

  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}
