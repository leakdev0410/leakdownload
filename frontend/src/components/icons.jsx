// icons.jsx — minimal stroked icon set for torrnet.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

const PATHS = {
  download: <><path d="M12 3v12" {...P} /><path d="M7 11l5 5 5-5" {...P} /><path d="M5 21h14" {...P} /></>,
  upload: <><path d="M12 21V9" {...P} /><path d="M7 13l5-5 5 5" {...P} /><path d="M5 3h14" {...P} /></>,
  play: <path d="M7 5l11 7-11 7V5z" {...P} />,
  pause: <><path d="M8 5v14M16 5v14" {...P} /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" {...P} />,
  plus: <><path d="M12 5v14M5 12h14" {...P} /></>,
  trash: <><path d="M4 7h16" {...P} /><path d="M9 7V5h6v2" {...P} /><path d="M6 7l1 13h10l1-13" {...P} /></>,
  search: <><circle cx="11" cy="11" r="6.5" {...P} /><path d="M20 20l-3.6-3.6" {...P} /></>,
  settings: <><circle cx="12" cy="12" r="3" {...P} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" {...P} /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" {...P} /><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none" /></>,
  chart: <><path d="M4 19V5" {...P} /><path d="M4 19h16" {...P} /><path d="M7 15l3-4 3 2 4-6" {...P} /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" {...P} />,
  file: <><path d="M6 3h8l4 4v14H6z" {...P} /><path d="M14 3v4h4" {...P} /></>,
  video: <><rect x="3" y="6" width="18" height="12" rx="2" {...P} /><path d="M10 9l5 3-5 3V9z" {...P} /></>,
  audio: <><path d="M9 18V6l10-2v12" {...P} /><circle cx="6" cy="18" r="3" {...P} /><circle cx="16" cy="16" r="3" {...P} /></>,
  software: <><rect x="3" y="4" width="18" height="14" rx="2" {...P} /><path d="M8 21h8M12 18v3" {...P} /></>,
  docs: <><path d="M6 3h8l4 4v14H6z" {...P} /><path d="M9 12h6M9 16h6M9 8h2" {...P} /></>,
  game: <><rect x="2" y="7" width="20" height="10" rx="5" {...P} /><path d="M7 11v3M5.5 12.5h3" {...P} /><circle cx="16" cy="11.5" r="1" fill="currentColor" stroke="none" /><circle cx="18.5" cy="13.5" r="1" fill="currentColor" stroke="none" /></>,
  peers: <><circle cx="9" cy="8" r="3" {...P} /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" {...P} /><path d="M16 11a3 3 0 0 0 0-6" {...P} /><path d="M21 20c0-2.5-1.4-4-3.5-4.6" {...P} /></>,
  info: <><circle cx="12" cy="12" r="9" {...P} /><path d="M12 11v5M12 8h.01" {...P} /></>,
  close: <path d="M6 6l12 12M18 6L6 18" {...P} />,
  magnet: <><path d="M6 4v7a6 6 0 0 0 12 0V4" {...P} /><path d="M6 4h4v7M14 4h4v7" {...P} /></>,
  check: <path d="M5 12l4 4 10-11" {...P} />,
  seed: <><path d="M12 21V9" {...P} /><path d="M12 9c-4 0-6-3-6-6 4 0 6 3 6 6zM12 13c4 0 6-3 6-6-4 0-6 3-6 6z" {...P} /></>,
  chevron: <path d="M9 6l6 6-6 6" {...P} />,
  sort: <><path d="M8 4v16M8 20l-3-3M8 4l3 3" {...P} /><path d="M16 20V4M16 4l3 3M16 20l-3-3" {...P} /></>,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" {...P} />,
  globe: <><circle cx="12" cy="12" r="9" {...P} /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" {...P} /></>,
  "arrow-left": <path d="M19 12H5M12 19l-7-7 7-7" {...P} />,
  sun: <><circle cx="12" cy="12" r="4" {...P} /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" {...P} /></>,
  moon: <path d="M20 13a9 9 0 0 1-9-9 9 9 0 1 0 9 9z" {...P} />,
  cog: <><circle cx="12" cy="12" r="3" {...P} /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" {...P} /></>,
  alert: <><circle cx="12" cy="12" r="9" {...P} /><path d="M12 9v4M12 16h.01" {...P} /></>,
};

function Icon({ name, size = 18, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} aria-hidden="true">
      {PATHS[name] || PATHS.file}
    </svg>
  );
}

export { Icon };
