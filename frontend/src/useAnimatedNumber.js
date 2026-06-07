import { useState, useEffect, useRef } from 'react';

function useAnimatedNumber(target, duration = 350) {
  const [current, setCurrent] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    startRef.current = 0;

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const p = Math.min((ts - startRef.current) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      setCurrent(p < 1 ? v : target);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return current;
}

export { useAnimatedNumber };
