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
 * Persistable resizable column widths + one-shot fit when table mounts.
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

  const runFit = useCallback((el) => {
    if (!el || didFitRef.current) return false;
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

  // Callback ref: fit ngay khi <table> mount (torrent list hoặc kết quả search).
  const tableRef = useCallback((el) => {
    tableNodeRef.current = el;
    if (!el) return;
    // Layout có thể chưa xong — thử vài nhịp.
    if (runFit(el)) return;
    requestAnimationFrame(() => {
      if (runFit(el)) return;
      requestAnimationFrame(() => runFit(el));
    });
    setTimeout(() => runFit(el), 50);
    setTimeout(() => runFit(el), 150);
  }, [runFit]);

  const startResize = useCallback((key, e) => {
    e.preventDefault();
    e.stopPropagation();
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
    requestAnimationFrame(() => {
      const el = tableNodeRef.current;
      if (el) runFit(el);
    });
  }, [runFit]);

  return { widths, startResize, resetWidths, setWidths, tableRef };
}

export { useColumnWidths, fitWidthsToContainer };
