import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Scale / trim column widths so total fits container width.
 * Prefer shrinking flexKeys first (e.g. name), then others, never below minWidth.
 * Extra space goes to the first flex key.
 */
function fitWidthsToContainer(widths, defaults, containerWidth, minWidth, flexKeys) {
  const keys = Object.keys(defaults);
  if (!keys.length || !containerWidth || containerWidth < 80) return widths;

  const next = {};
  for (const k of keys) {
    next[k] = Math.max(minWidth, Math.round(Number(widths[k] ?? defaults[k]) || minWidth));
  }

  const sum = () => keys.reduce((s, k) => s + next[k], 0);
  let total = sum();
  if (total <= 0) return widths;

  if (total > containerWidth) {
    const scale = containerWidth / total;
    for (const k of keys) {
      next[k] = Math.max(minWidth, Math.floor(next[k] * scale));
    }
    let overflow = sum() - containerWidth;
    if (overflow > 0) {
      const order = [
        ...flexKeys.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !flexKeys.includes(k)),
      ];
      for (const k of order) {
        if (overflow <= 0) break;
        const can = next[k] - minWidth;
        if (can <= 0) continue;
        const cut = Math.min(can, overflow);
        next[k] -= cut;
        overflow -= cut;
      }
    }
  } else if (total < containerWidth - 1) {
    const flex = flexKeys.find((k) => keys.includes(k)) || keys[0];
    next[flex] += containerWidth - total;
  }

  let changed = false;
  for (const k of keys) {
    if (next[k] !== widths[k]) {
      changed = true;
      break;
    }
  }
  return changed ? next : widths;
}

/**
 * Persistable resizable column widths + fit when table mounts / container resizes.
 * Works for tables that appear later (search results) via callback ref.
 */
function useColumnWidths(storageKey, defaults, minWidth = 56, options = {}) {
  const optionsRef = useRef(options);
  const [widths, setWidths] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaults, ...parsed };
      }
    } catch { /* private mode */ }
    return { ...defaults };
  });

  const widthsRef = useRef(widths);
  const tableNodeRef = useRef(null);
  const didFitRef = useRef(false);
  const defaultsRef = useRef(defaults);
  const minWidthRef = useRef(minWidth);
  const userResizedRef = useRef(false);
  const roRef = useRef(null);
  const roTimerRef = useRef(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  useEffect(() => {
    defaultsRef.current = defaults;
    minWidthRef.current = minWidth;
  }, [defaults, minWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch { /* ignore */ }
  }, [storageKey, widths]);

  useEffect(() => () => {
    if (roRef.current) roRef.current.disconnect();
    if (roTimerRef.current) clearTimeout(roTimerRef.current);
  }, []);

  const applyFit = useCallback((el, force = false) => {
    if (!el) return false;
    if (!force && didFitRef.current && userResizedRef.current) return false;
    const container = el.parentElement || el;
    const avail = Math.floor(container.clientWidth || 0);
    if (avail < 100) return false;
    didFitRef.current = true;
    const fk = optionsRef.current?.flexKeys;
    const flexKeys = fk && fk.length ? fk : ['name'];
    setWidths((prev) =>
      fitWidthsToContainer(prev, defaultsRef.current, avail, minWidthRef.current, flexKeys),
    );
    return true;
  }, []);

  // Callback ref: fit ngay khi <table> mount + observe resize.
  const tableRef = useCallback((el) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (roTimerRef.current) {
      clearTimeout(roTimerRef.current);
      roTimerRef.current = null;
    }
    tableNodeRef.current = el;
    if (!el) return;

    didFitRef.current = false;
    userResizedRef.current = false;

    const tryFit = () => applyFit(el, true);
    if (!tryFit()) {
      requestAnimationFrame(() => {
        if (tryFit()) return;
        requestAnimationFrame(tryFit);
      });
      setTimeout(tryFit, 50);
      setTimeout(tryFit, 150);
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (userResizedRef.current) return;
        if (roTimerRef.current) clearTimeout(roTimerRef.current);
        roTimerRef.current = setTimeout(() => {
          const node = tableNodeRef.current;
          if (node) applyFit(node, true);
        }, 80);
      });
      ro.observe(el.parentElement || el);
      roRef.current = ro;
    }
  }, [applyFit]);

  const startResize = useCallback((key, e) => {
    e.preventDefault();
    e.stopPropagation();
    userResizedRef.current = true;
    const startX = e.clientX;
    const startW = widthsRef.current[key] ?? defaultsRef.current[key] ?? 100;
    const minW = minWidthRef.current;

    document.body.classList.add('col-resizing');

    const onMove = (ev) => {
      const next = Math.max(minW, Math.round(startW + (ev.clientX - startX)));
      setWidths((w) => (w[key] === next ? w : { ...w, [key]: next }));
    };
    const onUp = () => {
      document.body.classList.remove('col-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const resetWidths = useCallback(() => {
    setWidths({ ...defaultsRef.current });
    didFitRef.current = false;
    userResizedRef.current = false;
    requestAnimationFrame(() => {
      const el = tableNodeRef.current;
      if (el) applyFit(el, true);
    });
  }, [applyFit]);

  return { widths, startResize, resetWidths, setWidths, tableRef };
}

export { useColumnWidths, fitWidthsToContainer };
