import { useState, useEffect, useRef } from 'react';

function useAnimatedNumber(target, duration = 350) {
  const [current, setCurrent] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const fromRef = useRef(target);
  const currentRef = useRef(target);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    // Start from last displayed value (even if previous animation was cancelled).
    const from = currentRef.current;
    if (from === target) {
      fromRef.current = target;
      return;
    }
    startRef.current = 0;

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const p = Math.min((ts - startRef.current) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      if (p < 1) {
        setCurrent(v);
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setCurrent(target);
        fromRef.current = target;
        currentRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Keep currentRef as last painted value for the next run.
      fromRef.current = currentRef.current;
    };
  }, [target, duration]);

  return current;
}

export { useAnimatedNumber };
