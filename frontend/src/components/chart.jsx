import { useMemo } from 'react';

let _chartId = 0;

function SpeedChart({ history, height = 120, accent = "var(--accent)", up = "var(--up)" }) {
  const pts = history.length ? history : [{ d: 0, u: 0 }];
  const ids = useMemo(() => { const id = ++_chartId; return { gd: `sgd${id}`, gu: `sgu${id}` }; }, []);
  const w = 600;
  const h = height;
  const pad = 6;
  const max = Math.max(1, ...pts.map((p) => Math.max(p.d, p.u))) * 1.2;
  const n = pts.length;
  // Single sample: center the point so marker isn't pinned to a fake right edge.
  const x = (i) => (n <= 1 ? w / 2 : pad + (i / (n - 1)) * (w - pad * 2));
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const lastIdx = Math.max(0, n - 1);

  function area(key) {
    let d = `M ${x(0)} ${h - pad}`;
    pts.forEach((p, i) => { d += ` L ${x(i)} ${y(p[key])}`; });
    d += ` L ${x(lastIdx)} ${h - pad} Z`;
    return d;
  }
  function line(key) {
    return pts.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p[key])}`).join(" ");
  }

  const last = pts[lastIdx];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id={ids.gd} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.gu} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up} stopOpacity="0.20" />
          <stop offset="100%" stopColor={up} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={h - pad - g * (h - pad * 2)} y2={h - pad - g * (h - pad * 2)}
          stroke="var(--grid)" strokeWidth="1" strokeDasharray="2 4" />
      ))}
      <path d={area("u")} fill={`url(#${ids.gu})`} />
      <path d={line("u")} fill="none" stroke={up} strokeWidth="1.6" strokeLinejoin="round" />
      <path d={area("d")} fill={`url(#${ids.gd})`} />
      <path d={line("d")} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(lastIdx)} cy={y(last.d)} r="3" fill={accent} />
    </svg>
  );
}

export { SpeedChart };
