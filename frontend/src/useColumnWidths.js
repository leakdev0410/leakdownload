import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Persistable resizable column widths.
 * @param {string} storageKey localStorage key
 * @param {Record<string, number>} defaults default px widths
 * @param {number} minWidth minimum px per column
 */
function useColumnWidths(storageKey, defaults, minWidth = 56) {
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

  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch { /* ignore */ }
  }, [storageKey, widths]);

  const startResize = useCallback((key, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthsRef.current[key] ?? defaults[key] ?? 100;

    document.body.classList.add('col-resizing');

    const onMove = (ev) => {
      const next = Math.max(minWidth, Math.round(startW + (ev.clientX - startX)));
      setWidths((w) => (w[key] === next ? w : { ...w, [key]: next }));
    };
    const onUp = () => {
      document.body.classList.remove('col-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [defaults, minWidth]);

  const resetWidths = useCallback(() => {
    setWidths({ ...defaults });
  }, [defaults]);

  return { widths, startResize, resetWidths, setWidths };
}

export { useColumnWidths };
