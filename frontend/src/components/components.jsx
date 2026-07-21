// components.jsx — shared UI atoms + torrent table + navigation for torrnet.
import { useState, useMemo, useCallback } from 'react';
import { Icon } from './icons.jsx';
import { fmtBytes, fmtSpeed, fmtEta } from '../utils.js';
import { useAnimatedNumber } from '../useAnimatedNumber.js';
import { useColumnWidths } from '../useColumnWidths.js';

const CAT_ICON = { video: "video", audio: "audio", software: "software", docs: "docs", game: "game" };

const STATUS_META = {
  metadata: { label: "Đang lấy TT", color: "var(--warn)", dot: "var(--warn)" },
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
  return <>{fmtSpeed(Math.round(v))}</>;
}

// ── Torrent table ────────────────────────────────────────────────
const TORRENT_COL_DEFAULTS = {
  name: 280,
  size: 100,
  progress: 140,
  status: 110,
  down: 96,
  up: 96,
  peers: 64,
  eta: 88,
  ratio: 64,
  actions: 84,
};

function Th({ colKey, children, align, sortBy, sortKey, asc, resizable, onResize, width }) {
  return (
    <th
      onClick={colKey && sortBy ? () => sortBy(colKey) : undefined}
      className={(colKey && sortBy ? "sortable" : "") + (resizable ? " resizable" : "")}
      style={{ textAlign: align || "left", width: width ? width + "px" : undefined }}
    >
      <span className="th-label">{children}{sortKey === colKey && <span className="sort-caret">{asc ? "▲" : "▼"}</span>}</span>
      {resizable && (
        <span
          className="col-resizer"
          title="Kéo để đổi độ rộng cột"
          onMouseDown={(e) => onResize(colKey, e)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      )}
    </th>
  );
}

function compareTorrents(a, b, sortKey) {
  switch (sortKey) {
    case "name": return (a.name || "").localeCompare(b.name || "");
    case "size": return (a.size || 0) - (b.size || 0);
    case "progress": return (a.progress || 0) - (b.progress || 0);
    case "down": return (a.down || 0) - (b.down || 0);
    case "up": return (a.up || 0) - (b.up || 0);
    case "peers": return (a.peers || 0) - (b.peers || 0);
    case "ratio": return (a.ratio || 0) - (b.ratio || 0);
    case "status": return (a.status || "").localeCompare(b.status || "");
    default: return 0;
  }
}

function TorrentTable({ torrents, selectedId, onSelect, onAction, density, progressStyle, exiting }) {
  const [sortKey, setSortKey] = useState("name");
  const [asc, setAsc] = useState(true);
  const { widths, startResize, tableRef } = useColumnWidths(
    "leakdownload-cols-torrents",
    TORRENT_COL_DEFAULTS,
    56,
    { flexKeys: ["name", "progress"] },
  );

  const totalWidth = useMemo(
    () => Object.values(widths).reduce((s, w) => s + (Number(w) || 0), 0),
    [widths],
  );

  const sortBy = useCallback((k) => {
    if (k === sortKey) setAsc(a => !a);
    else { setSortKey(k); setAsc(true); }
  }, [sortKey]);

  const sorted = useMemo(() => {
    const list = [...torrents];
    list.sort((a, b) => {
      const r = compareTorrents(a, b, sortKey);
      return asc ? r : -r;
    });
    return list;
  }, [torrents, sortKey, asc]);

  const col = (k) => ({ width: widths[k] });

  return (
    <table
      ref={tableRef}
      className={"ttable resizable-table " + density}
      style={{ width: totalWidth, minWidth: "100%" }}
    >
      <colgroup>
        {Object.keys(TORRENT_COL_DEFAULTS).map((k) => (
          <col key={k} style={{ width: widths[k] + "px" }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <Th colKey="name" sortBy={sortBy} sortKey={sortKey} asc={asc} resizable onResize={startResize} {...col("name")}>Tên</Th>
          <Th colKey="size" align="right" sortBy={sortBy} sortKey={sortKey} asc={asc} resizable onResize={startResize} {...col("size")}>Kích thước</Th>
          <Th colKey="progress" sortBy={sortBy} sortKey={sortKey} asc={asc} resizable onResize={startResize} {...col("progress")}>Tiến trình</Th>
          <Th colKey="status" sortBy={sortBy} sortKey={sortKey} asc={asc} resizable onResize={startResize} {...col("status")}>Trạng thái</Th>
          <Th colKey="down" align="right" sortBy={sortBy} sortKey={sortKey} asc={asc} resizable onResize={startResize} {...col("down")}>↓ Tải</Th>
          <Th colKey="up" align="right" sortBy={sortBy} sortKey={sortKey} asc={asc} resizable onResize={startResize} {...col("up")}>↑ Lên</Th>
          <Th colKey="peers" align="right" sortBy={sortBy} sortKey={sortKey} asc={asc} resizable onResize={startResize} {...col("peers")}>Peers</Th>
          <Th colKey="eta" align="right" resizable onResize={startResize} {...col("eta")}>ETA</Th>
          <Th colKey="ratio" align="center" sortBy={sortBy} sortKey={sortKey} asc={asc} resizable onResize={startResize} {...col("ratio")}>Ratio</Th>
          <Th colKey="actions" {...col("actions")}></Th>
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
              <td className="mono num" title={t.size ? String(t.size) + " B" : undefined}>{t.size ? fmtBytes(t.size) : "—"}</td>
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
  const isPaused = t.status === "paused";
  const isQueued = t.status === "queued";
  // Paused hoặc queued: nút play (tiếp tục / ưu tiên lên đầu queue).
  const showPlay = isPaused || isQueued;
  return (
    <div className="row-actions">
      <button
        className="ibtn"
        title={isQueued ? "Ưu tiên tải ngay" : isPaused ? "Tiếp tục" : "Tạm dừng"}
        onClick={() => onAction(t, showPlay ? "resume" : "pause")}
      >
        <Icon name={showPlay ? "play" : "pause"} size={15} />
      </button>
      <button className="ibtn danger" title="Xóa" onClick={() => onAction(t, "remove")}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

// ── Navigation (sidebar or topbar layout) ────────────────────────
const NAV = [
  { id: "search", label: "Tìm kiếm", icon: "search" },
  { id: "all", label: "Tất cả", icon: "list" },
  { id: "downloading", label: "Đang tải", icon: "download" },
  { id: "queued", label: "Hàng đợi", icon: "list" },
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
