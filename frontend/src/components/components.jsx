// components.jsx — shared UI atoms + torrent table + navigation for torrnet.
  import { useState } from 'react';
  import { Icon } from './icons.jsx';
import { fmtBytes, fmtSpeed, fmtEta } from '../utils.js';
import { useAnimatedNumber } from '../useAnimatedNumber.js';

  const CAT_ICON = { video: "video", audio: "audio", software: "software", docs: "docs", game: "game" };

  const STATUS_META = {
    downloading: { label: "Đang tải", color: "var(--accent)", dot: "var(--accent)" },
    seeding: { label: "Đang seed", color: "var(--up)", dot: "var(--up)" },
    completed: { label: "Hoàn tất", color: "var(--ok)", dot: "var(--ok)" },
    paused: { label: "Tạm dừng", color: "var(--muted)", dot: "var(--muted)" },
    queued: { label: "Hàng đợi", color: "var(--muted)", dot: "var(--warn)" },
  };

  function StatusPill({ status }) {
    const m = STATUS_META[status] || STATUS_META.queued;
    return (
      <span className="pill" style={{ color: m.color }}>
        <span className="pill-dot" style={{ background: m.dot }} />
        {m.label}
      </span>
    );
  }

  // progressStyle: bar | ring | striped
  function ProgressView({ value, status, style: ps, size = "row" }) {
    const pct = Math.round(value * 100);
    const done = value >= 1;
    const color = status === "seeding" || done ? "var(--up)" : status === "paused" || status === "queued" ? "var(--muted)" : "var(--accent)";
    if (ps === "ring") {
      const r = size === "row" ? 11 : 26;
      const sw = size === "row" ? 3 : 5;
      const C = 2 * Math.PI * r;
      const box = (r + sw) * 2;
      return (
        <div className="ring-wrap" title={pct + "%"}>
          <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`}>
            <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={sw} />
            <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
              strokeDasharray={C} strokeDashoffset={C * (1 - value)} strokeLinecap="round"
              transform={`rotate(-90 ${box / 2} ${box / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} />
          </svg>
          {size !== "row" && <span className="ring-label mono">{pct}%</span>}
        </div>
      );
    }
    const striped = ps === "striped" && !done && status === "downloading";
    return (
      <div className={"bar " + (size === "lg" ? "bar-lg" : "")}>
        <div className={"bar-fill" + (striped ? " striped" : "")} style={{ width: pct + "%", background: color }} />
      </div>
    );
  }

  function CatIcon({ category, size = 16 }) {
    return <Icon name={CAT_ICON[category] || "file"} size={size} />;
  }

  function AnimatedSpeed({ bps }) {
    const v = useAnimatedNumber(bps || 0, 350);
    return <>{bps ? fmtSpeed(Math.round(v)) : "—"}</>;
  }

  // ── Torrent table ────────────────────────────────────────────────
  function TorrentTable({ torrents, selectedId, onSelect, onAction, density, progressStyle, exiting }) {
    const [sortKey, setSortKey] = useState("name");
    const [asc, setAsc] = useState(true);

    function sortBy(k) {
      if (k === sortKey) setAsc(!asc);
      else { setSortKey(k); setAsc(true); }
    }
    const sorted = [...torrents].sort((a, b) => {
      let r = 0;
      if (sortKey === "name") r = a.name.localeCompare(b.name);
      else if (sortKey === "size") r = a.size - b.size;
      else if (sortKey === "progress") r = a.progress - b.progress;
      else if (sortKey === "down") r = a.down - b.down;
      else if (sortKey === "up") r = a.up - b.up;
      else r = 0;
      return asc ? r : -r;
    });

    const Th = ({ k, children, align }) => (
      <th onClick={k ? () => sortBy(k) : undefined} className={k ? "sortable" : ""} style={{ textAlign: align || "left" }}>
        <span>{children}{sortKey === k && <span className="sort-caret">{asc ? "▲" : "▼"}</span>}</span>
      </th>
    );

    return (
      <table className={"ttable " + density}>
        <thead>
          <tr>
            <Th>Tên</Th>
            <Th k="size" align="right">Kích thước</Th>
            <Th k="progress">Tiến trình</Th>
            <Th>Trạng thái</Th>
            <Th k="down" align="right">↓ Tải</Th>
            <Th k="up" align="right">↑ Lên</Th>
            <Th align="right">Peers</Th>
            <Th align="right">ETA</Th>
            <Th align="center">Ratio</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => {
            const eta = (t.status === "downloading" && t.down > 0 ? (t.size * (1 - t.progress)) / t.down : (t.progress >= 1 ? 0 : Infinity));
            const isExit = exiting && exiting.has(t.hash);
            const rowClass = [
              selectedId === t.id ? "sel" : "",
              t._enter ? "tr-enter" : "",
              isExit ? "tr-exit" : "",
            ].filter(Boolean).join(" ") || undefined;
            const rowStyle = t._enter ? { animationDelay: (i * 50) + "ms" } : undefined;
            return (
              <tr key={t.id} className={rowClass} style={rowStyle} onClick={() => onSelect(t)}>
                <td className="cell-name">
                  <span className="cat-ico">
                    <CatIcon category={t.category} />
                  </span>
                  <span className="name-text" title={t.name}>{t.name}</span>
                </td>
                <td className="mono num">{t.size ? fmtBytes(t.size) : "—"}</td>
                <td className="cell-prog">
                  <ProgressView value={t.progress} status={t.status} style={progressStyle} />
                  <span className="mono pct">{Math.round(t.progress * 100)}%</span>
                </td>
                <td>
                  <StatusPill status={t.status} />
                </td>
                <td className="mono num dl"><AnimatedSpeed bps={t.down} /></td>
                <td className="mono num ul"><AnimatedSpeed bps={t.up} /></td>
                <td className="mono num">{t.peers || "—"}</td>
                <td className="mono num">{t.status === "downloading" ? fmtEta(eta) : "—"}</td>
                <td className="mono num center" style={{ color: (t.ratio ?? 0) >= 1 ? "var(--up)" : "var(--muted)" }}>{(t.ratio ?? 0).toFixed(2)}</td>
                <td className="cell-act" onClick={(e) => e.stopPropagation()}>
                  <RowActions t={t} onAction={onAction} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  function RowActions({ t, onAction }) {
    const canPause = t.status === "downloading" || t.status === "seeding" || t.status === "queued";
    const isPaused = t.status === "paused";
    return (
      <div className="row-actions">
        <button className="ibtn" title={isPaused ? "Tiếp tục" : "Tạm dừng"} onClick={() => onAction(t, isPaused ? "resume" : "pause")}>
          <Icon name={isPaused ? "play" : "pause"} size={15} />
        </button>
        <button className="ibtn danger" title="Xóa" onClick={() => onAction(t, "remove")}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    );
  }

  // ── Navigation (sidebar or topbar layout) ────────────────────────
  const NAV = [
    { id: "all", label: "Tất cả", icon: "list" },
    { id: "downloading", label: "Đang tải", icon: "download" },
    { id: "seeding", label: "Đang seed", icon: "upload" },
    { id: "completed", label: "Hoàn tất", icon: "check" },
    { id: "paused", label: "Tạm dừng", icon: "pause" },
  ];

  function Brand({ compact }) {
    return (
      <div className="brand">
        <div className="brand-mark"><Icon name="download" size={18} /></div>
        {!compact && <div className="brand-name">leak<span>download</span></div>}
      </div>
    );
  }

  function NavItems({ active, onNav, counts, vertical }) {
    return (
      <nav className={"nav " + (vertical ? "nav-v" : "nav-h")}>
        {NAV.map((n) => (
          <button key={n.id} className={"nav-item" + (active === n.id ? " active" : "")} onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={17} />
            <span className="nav-label">{n.label}</span>
            {counts[n.id] != null && <span className="nav-count mono">{counts[n.id]}</span>}
          </button>
        ))}
      </nav>
    );
  }

  export { StatusPill, ProgressView, CatIcon, TorrentTable, NavItems, Brand, NAV, STATUS_META };
