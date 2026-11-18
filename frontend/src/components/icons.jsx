// icons.jsx — leak-design icon set.
// 24px grid, 3px safe margin, 1.75 stroke, round caps/joins, 2–3px corner radii.
// All glyphs share one stroke group so weight stays consistent at every size.

const TRAY = "M5 16v1.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V16";
const SLIDERS = (
  <>
    <path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20" />
    <circle cx="15" cy="7" r="2.5" />
    <circle cx="9" cy="17" r="2.5" />
  </>
);

const PATHS = {
  download: <><path d="M12 4v11" /><path d="M7.5 10.5 12 15l4.5-4.5" /><path d={TRAY} /></>,
  upload: <><path d="M12 15V4" /><path d="M7.5 8.5 12 4l4.5 4.5" /><path d={TRAY} /></>,
  play: <path d="M8.5 5.9v12.2a.9.9 0 0 0 1.4.8l9.2-6.1a.9.9 0 0 0 0-1.5L9.9 5.1a.9.9 0 0 0-1.4.8z" />,
  pause: <><rect x="6.5" y="5" width="3.6" height="14" rx="1.5" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.5" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M4.5 7h15" /><path d="M9.5 7V5.3c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3V7" /><path d="m6.5 7 .8 11.4a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7" /><path d="M10 11v5M14 11v5" /></>,
  search: <><circle cx="11" cy="11" r="6.25" /><path d="m20 20-4.4-4.4" /></>,
  settings: SLIDERS,
  cog: SLIDERS,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.8" cy="6.5" r="1" fill="currentColor" stroke="none" /><circle cx="4.8" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4.8" cy="17.5" r="1" fill="currentColor" stroke="none" /></>,
  queue: <><path d="M4 6.5h16M4 12h7.5M4 17.5h5" /><circle cx="17" cy="16.5" r="4" /><path d="M17 14.6v2l1.3.8" /></>,
  chart: <><path d="M4 4.5v13A2.5 2.5 0 0 0 6.5 20H20" /><path d="m8 15 3-4 3 2.5 4.5-6" /></>,
  folder: <path d="M3.5 8.2A2.2 2.2 0 0 1 5.7 6h3.6c.5 0 .9.2 1.2.5l1 1.1c.3.3.7.4 1.1.4h5.7a2.2 2.2 0 0 1 2.2 2.2v6.6a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V8.2z" />,
  file: <><path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7z" /><path d="M14 3v3a1 1 0 0 0 1 1h3" /></>,
  video: <><rect x="3" y="5.5" width="18" height="13" rx="3.5" /><path d="M10.2 9.5v5l4.3-2.5z" /></>,
  audio: <><path d="M9 17.5v-11l10-2v11" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="16.5" cy="15.5" r="2.5" /></>,
  software: <><rect x="3" y="4.5" width="18" height="12" rx="2.8" /><path d="M8.5 20h7M12 16.5V20" /></>,
  docs: <><path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7z" /><path d="M14 3v3a1 1 0 0 0 1 1h3" /><path d="M9 12.5h6M9 16h4" /></>,
  game: <><path d="M7.5 8h9a4.5 4.5 0 0 1 4.4 5.4l-.6 2.9a2.4 2.4 0 0 1-4 1.3L15 15.5H9l-1.8 1.6a2.4 2.4 0 0 1-4-1.3l-.6-2.9A4.5 4.5 0 0 1 7.5 8z" /><path d="M8 10.8v3M6.5 12.3h3" /><circle cx="15.3" cy="11.6" r=".9" fill="currentColor" stroke="none" /><circle cx="17.5" cy="13.6" r=".9" fill="currentColor" stroke="none" /></>,
  peers: <><circle cx="9" cy="8.2" r="3.2" /><path d="M3.5 19.5c0-3.1 2.4-5 5.5-5s5.5 1.9 5.5 5" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6" /><path d="M17.6 14.6c2 .5 3.4 2.1 3.4 4.9" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.2" /><circle cx="12" cy="7.9" r=".95" fill="currentColor" stroke="none" /></>,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  magnet: <><path d="M6 3.5v8a6 6 0 0 0 12 0v-8" /><path d="M6 8h3.6M14.4 8H18" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  seed: <><path d="M12 20.5V11" /><path d="M12 11c-3.9 0-6-2.2-6-5.5 3.9 0 6 2.2 6 5.5z" /><path d="M12 14.2c3.4 0 5.5-1.9 5.5-4.8-3.4 0-5.5 1.9-5.5 4.8z" /></>,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  sort: <><path d="M8 4.5v15M8 19.5l-3-3M8 4.5l3 3" /><path d="M16 19.5v-15M16 4.5l3 3M16 19.5l-3-3" /></>,
  bolt: <path d="M13 3 5.5 13.5H11L10.5 21 18.5 10.5H13L13 3z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17" /><path d="M12 3c2.4 2.5 3.4 5.4 3.4 9s-1 6.5-3.4 9c-2.4-2.5-3.4-5.4-3.4-9S9.6 5.5 12 3z" /></>,
  "arrow-left": <path d="M19 12H5.5M11.5 18l-6-6 6-6" />,
  sun: <><circle cx="12" cy="12" r="3.8" /><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" /></>,
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.6v5.2" /><circle cx="12" cy="16.2" r=".95" fill="currentColor" stroke="none" /></>,
};

function Icon({ name, size = 18, style, className, strokeWidth = 1.75 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {PATHS[name] || PATHS.file}
      </g>
    </svg>
  );
}

export { Icon };
