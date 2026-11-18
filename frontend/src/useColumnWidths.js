import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

function colMin(key, minWidth, minWidths) {
  const hard = 28;
  if (minWidths && minWidths[key] != null) {
    return Math.max(hard, Number(minWidths[key]) || hard);
  }
  return Math.max(hard, Number(minWidth) || hard);
}

/**
 * Turn column weights into pixel widths that sum exactly to containerWidth.
 */
function distributeToContainer(weights, keys, containerWidth, minWidth, minWidths, flexKeys) {
  const out = {};
  if (!keys.length) return out;

  if (!containerWidth || containerWidth < 80) {
    for (const k of keys) out[k] = colMin(k, minWidth, minWidths);
    return out;
  }

  const floors = {};
  let floorSum = 0;
  const w = {};
  let wSum = 0;
  for (const k of keys) {
    floors[k] = colMin(k, minWidth, minWidths);
    floorSum += floors[k];
    w[k] = Math.max(1, Number(weights[k]) || floors[k] || 1);
    wSum += w[k];
  }

  if (wSum <= 0) wSum = keys.length;

  // Proportional allocation
  let used = 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (i === keys.length - 1) {
      out[k] = Math.max(floors[k], containerWidth - used);
    } else {
      const px = Math.max(floors[k], Math.floor((w[k] / wSum) * containerWidth));
      out[k] = px;
      used += px;
    }
  }

  // If floors forced overflow, scale everything down proportionally (ignore floors)
  let total = keys.reduce((s, k) => s + out[k], 0);
  if (total > containerWidth) {
    if (floorSum > containerWidth) {
      used = 0;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (i === keys.length - 1) {
          out[k] = Math.max(28, containerWidth - used);
        } else {
          out[k] = Math.max(28, Math.floor((w[k] / wSum) * containerWidth));
          used += out[k];
        }
      }
    } else {
      // Trim slack above floors, largest first
      let overflow = total - containerWidth;
      const order = [...keys].sort((a, b) => (out[b] - floors[b]) - (out[a] - floors[a]));
      for (const k of order) {
        if (overflow <= 0) break;
        const can = out[k] - floors[k];
        if (can <= 0) continue;
        const cut = Math.min(can, overflow);
        out[k] -= cut;
        overflow -= cut;
      }
    }
  }

  // Fill leftover into flex key so table always spans full width
  total = keys.reduce((s, k) => s + out[k], 0);
  let remain = containerWidth - total;
  if (remain !== 0) {
    const fk = (flexKeys || []).find((k) => keys.includes(k)) || keys[0];
    out[fk] = Math.max(floors[fk] ?? 28, out[fk] + remain);
  }

  // Exact sum (rounding): adjust last key
  total = keys.reduce((s, k) => s + out[k], 0);
  if (total !== containerWidth && keys.length) {
    const last = keys[keys.length - 1];
    out[last] += containerWidth - total;
    if (out[last] < 28) {
      const deficit = 28 - out[last];
      out[last] = 28;
      const fk = (flexKeys || []).find((k) => keys.includes(k)) || keys[0];
      if (fk !== last) out[fk] = Math.max(28, out[fk] - deficit);
    }
  }

  return out;
}

/**
 * Column layout that always fills the parent container width.
 * Stores weights (proportions); live px widths follow container via ResizeObserver.
 */
function useColumnWidths(storageKey, defaults, minWidth = 48, options = {}) {
  const keys = useMemo(() => Object.keys(defaults), [defaults]);
  const optionsRef = useRef(options);
  const defaultsRef = useRef(defaults);
  const minWidthRef = useRef(minWidth);
  const weightsRef = useRef(null);
  const tableNodeRef = useRef(null);
  const roRef = useRef(null);
  const winHandlerRef = useRef(null);

  const [weights, setWeights] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const src = parsed?.weights && typeof parsed.weights === 'object' ? parsed.weights : parsed;
        const merged = { ...defaults };
        for (const k of Object.keys(defaults)) {
          if (src[k] != null && Number(src[k]) > 0) merged[k] = Number(src[k]);
        }
        return merged;
      }
    } catch { /* private mode */ }
    return { ...defaults };
  });

  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    defaultsRef.current = defaults;
    minWidthRef.current = minWidth;
  }, [defaults, minWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ weights, v: 3 }));
    } catch { /* ignore */ }
  }, [storageKey, weights]);

  const measure = useCallback((el) => {
    if (!el) return 0;
    const container = el.parentElement || el;
    return Math.floor(container.clientWidth || 0);
  }, []);

  const syncContainer = useCallback((el) => {
    const w = measure(el);
    if (w >= 80) {
      setContainerW((prev) => (prev === w ? prev : w));
    }
  }, [measure]);

  const tableRef = useCallback((el) => {
    // teardown previous observers
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (winHandlerRef.current) {
      window.removeEventListener('resize', winHandlerRef.current);
      winHandlerRef.current = null;
    }
    tableNodeRef.current = el;
    if (!el) return;

    const tick = () => syncContainer(el);
    tick();
    requestAnimationFrame(tick);
    requestAnimationFrame(() => requestAnimationFrame(tick));
    const t1 = setTimeout(tick, 50);
    const t2 = setTimeout(tick, 200);

    if (typeof ResizeObserver !== 'undefined') {
      let timer = null;
      const ro = new ResizeObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          requestAnimationFrame(() => syncContainer(tableNodeRef.current));
        }, 16);
      });
      const parent = el.parentElement || el;
      ro.observe(parent);
      ro.observe(el);
      roRef.current = {
        disconnect() {
          if (timer) clearTimeout(timer);
          ro.disconnect();
          clearTimeout(t1);
          clearTimeout(t2);
        },
      };
    }

    const onWin = () => syncContainer(tableNodeRef.current);
    winHandlerRef.current = onWin;
    window.addEventListener('resize', onWin);
  }, [syncContainer]);

  useEffect(() => () => {
    if (roRef.current) roRef.current.disconnect();
    if (winHandlerRef.current) {
      window.removeEventListener('resize', winHandlerRef.current);
      winHandlerRef.current = null;
    }
  }, []);

  const flexKeys = options.flexKeys;
  const minWidths = options.minWidths;

  const widths = useMemo(() => {
    const fallback = keys.reduce((s, k) => s + (Number(defaults[k]) || 0), 0) || 800;
    return distributeToContainer(
      weights,
      keys,
      containerW || fallback,
      minWidth,
      minWidths,
      flexKeys,
    );
  }, [weights, keys, containerW, minWidth, minWidths, flexKeys, defaults]);

  const startResize = useCallback((key, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWeight = weightsRef.current[key] ?? defaultsRef.current[key] ?? 100;
    const el = tableNodeRef.current;
    const avail = measure(el) || 1;
    const minPx = colMin(key, minWidthRef.current, optionsRef.current?.minWidths);

    const wSum = Object.keys(defaultsRef.current).reduce(
      (s, k) => s + Math.max(1, Number(weightsRef.current[k]) || 1),
      0,
    );
    const pxPerW = avail / Math.max(1, wSum);
    const minWeight = minPx / pxPerW;

    document.body.classList.add('col-resizing');

    const onMove = (ev) => {
      const deltaW = (ev.clientX - startX) / pxPerW;
      const nextW = Math.max(minWeight, startWeight + deltaW);
      setWeights((prev) => (prev[key] === nextW ? prev : { ...prev, [key]: nextW }));
    };
    const onUp = () => {
      document.body.classList.remove('col-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      requestAnimationFrame(() => syncContainer(tableNodeRef.current));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [measure, syncContainer]);

  const resetWidths = useCallback(() => {
    setWeights({ ...defaultsRef.current });
    requestAnimationFrame(() => syncContainer(tableNodeRef.current));
  }, [syncContainer]);

  return { widths, startResize, resetWidths, setWidths: setWeights, tableRef, containerW };
}

export { useColumnWidths, distributeToContainer };
