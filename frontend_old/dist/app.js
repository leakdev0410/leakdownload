// torrnet — frontend logic, nối với backend Go qua Wails.
//   window.go.main.App.<Method>(...)  -> Promise
//   window.runtime.EventsOn(name, cb) -> sự kiện realtime từ Go
"use strict";

const ACCENT = "#E76A2E", UP = "#1f9e8f", OK = "#3a9d4f", MUTED = "#8a8378";

/* ---------- icons (trích từ chính bản thiết kế) ---------- */
const ICONS = {
  brand:    '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>',
  download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>',
  upload:   '<path d="M12 21V9"/><path d="M7 13l5-5 5 5"/><path d="M5 3h14"/>',
  list:     '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  seed:     '<path d="M12 21V9"/><path d="M7 13l5-5 5 5"/><path d="M5 3h14"/>',
  check:    '<path d="M5 12l4 4 10-11"/>',
  pause:    '<path d="M8 5v14M16 5v14"/>',
  play:     '<path d="M7 5l11 7-11 7V5z"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  search:   '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.6-3.6"/>',
  users:    '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 11a3 3 0 0 0 0-6"/><path d="M21 20c0-2.5-1.4-4-3.5-4.6"/>',
  ratio:    '<path d="M12 21V9"/><path d="M12 9c-4 0-6-3-6-6 4 0 6 3 6 6zM12 13c4 0 6-3 6-6-4 0-6 3-6 6z"/>',
  globe:    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  bolt:     '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>',
  file:     '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  folder:   '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  trash:    '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18"/>',
  gear:     '<path d="M4 6h9M19 6h1M4 12h1M11 12h9M4 18h6M16 18h4"/><circle cx="16" cy="6" r="2" fill="none"/><circle cx="8" cy="12" r="2" fill="none"/><circle cx="13" cy="18" r="2" fill="none"/>',
  catVideo: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M10 9l5 3-5 3V9z"/>',
  catDisc:  '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
  catAudio: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  catGame:  '<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13.5" r="1" fill="currentColor" stroke="none"/>',
  catData:  '<path d="M6 3h8l4 4v14H6z"/><path d="M9 12h6M9 16h6M9 8h2"/>',
  catFile:  '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
};
function svg(inner, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const api = () => (window.go && window.go.main && window.go.main.App) || {};
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function fmtBytes(n) {
  n = +n || 0; if (n < 0) n = 0;
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(n < 10 ? 2 : 1)) + " " + u[i];
}
const fmtSpeed = (n) => fmtBytes(n) + "/s";
const rowSpeed = (n) => (n > 0 ? fmtSpeed(n) : "—");
function fmtEta(sec) {
  if (sec == null || sec < 0) return "—";
  sec = Math.round(sec);
  if (sec < 60) return sec + "s";
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return m + "m" + (s ? " " + s + "s" : "");
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return h + "h" + (mm ? " " + mm + "m" : "");
  const d = Math.floor(h / 24), hh = h % 24;
  return d + "d" + (hh ? " " + hh + "h" : "");
}
const fmtNum = (n) => (+n || 0).toLocaleString("en-US");

function catKey(name) {
  name = (name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";
  if (/^(mkv|mp4|avi|mov|webm|m4v|wmv|flv|mpg|mpeg)$/.test(ext)) return "catVideo";
  if (/^(mp3|flac|wav|ogg|m4a|aac|opus|wma)$/.test(ext)) return "catAudio";
  if (/^(iso|img|dmg)$/.test(ext) || /ubuntu|debian|linux|mint|fedora|arch|windows|macos|lts/.test(name)) return "catDisc";
  if (/^(exe|msi|appimage|apk|deb|rpm|bin|pkg)$/.test(ext)) return "catGame";
  if (/^(zip|rar|7z|tar|gz|xz|bz2|zst)$/.test(ext)) return "catData";
  return "catFile";
}

const STATUS = {
  metadata:    { label: "Metadata", color: "var(--accent)" },
  downloading: { label: "Đang tải", color: "var(--accent)" },
  seeding:     { label: "Đang seed", color: "var(--up)" },
  completed:   { label: "Hoàn tất", color: "var(--ok)" },
  paused:      { label: "Tạm dừng", color: "var(--muted)" },
};
function barColor(t) {
  if (t.status === "paused") return "var(--muted)";
  if (t.status === "seeding" || t.status === "completed") return "var(--up)";
  return "var(--accent)";
}

const NAV = [
  { key: "all", label: "Tất cả", ic: "list" },
  { key: "downloading", label: "Đang tải", ic: "download" },
  { key: "seeding", label: "Đang seed", ic: "seed" },
  { key: "completed", label: "Hoàn tất", ic: "check" },
  { key: "paused", label: "Tạm dừng", ic: "pause" },
];

/* ---------- state ---------- */
const state = {
  torrents: [],
  stats: {},
  filter: "all",
  search: "",
  sort: { key: null, dir: 1 },
  selected: null,
  detail: null,
  tab: "files",
  chart: { hash: null, d: [], u: [] },
};

/* ---------- toast ---------- */
let toastT = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 3200);
}

/* ---------- filtering / sorting ---------- */
function matchFilter(t) {
  switch (state.filter) {
    case "downloading": return t.status === "downloading" || t.status === "metadata";
    case "seeding": return t.status === "seeding";
    case "completed": return t.status === "completed";
    case "paused": return t.status === "paused";
    default: return true;
  }
}
function visibleTorrents() {
  const q = state.search.trim().toLowerCase();
  let arr = state.torrents.filter((t) => matchFilter(t) && (!q || (t.name || "").toLowerCase().includes(q)));
  const { key, dir } = state.sort;
  if (!key) arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else arr.sort((a, b) => {
    let x = a[key], y = b[key];
    if (key === "eta") { x = x < 0 ? Infinity : x; y = y < 0 ? Infinity : y; }
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  return arr;
}

/* ---------- render: sidebar nav ---------- */
function renderNav() {
  const s = state.stats || {};
  const counts = { all: s.total || 0, downloading: s.downloading || 0, seeding: s.seeding || 0, completed: s.completed || 0, paused: s.paused || 0 };
  $("nav").innerHTML = NAV.map((n) =>
    `<button class="nav-item${state.filter === n.key ? " active" : ""}" data-filter="${n.key}">
       ${svg(ICONS[n.ic], 17)}
       <span class="nav-label">${n.label}</span>
       <span class="nav-count mono">${counts[n.key]}</span>
     </button>`).join("");
  $("mini-dl").textContent = fmtSpeed(s.downSpeed || 0);
  $("mini-ul").textContent = fmtSpeed(s.upSpeed || 0);
}

/* ---------- render: table rows ---------- */
function renderRows() {
  const rows = visibleTorrents();
  const empty = $("empty");
  const table = document.querySelector(".ttable");
  if (state.torrents.length === 0) {
    empty.hidden = false; table.style.display = "none"; $("rows").innerHTML = ""; return;
  }
  empty.hidden = true; table.style.display = "";

  $("rows").innerHTML = rows.map((t) => {
    const st = STATUS[t.status] || STATUS.downloading;
    const pct = Math.min(100, t.progress || 0);
    const ratioCol = (t.ratio || 0) >= 1 ? "var(--up)" : "var(--muted)";
    const paused = t.status === "paused";
    const peers = t.peers > 0 ? t.peers : "—";
    const eta = t.status === "downloading" ? fmtEta(t.eta) : "—";
    return `<tr class="${t.infoHash === state.selected ? "sel" : ""}" data-hash="${t.infoHash}">
      <td class="cell-name">
        <span class="cat-ico">${svg(ICONS[catKey(t.name)], 16)}</span>
        <span class="name-text" title="${esc(t.name)}">${esc(t.name)}</span>
      </td>
      <td class="mono num">${t.totalBytes ? fmtBytes(t.totalBytes) : "—"}</td>
      <td class="cell-prog">
        <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${barColor(t)}"></div></div>
        <span class="mono pct">${pct.toFixed(0)}%</span>
      </td>
      <td><span class="pill" style="color:${st.color}"><span class="pill-dot" style="background:${st.color}"></span>${st.label}</span></td>
      <td class="mono num dl">${rowSpeed(t.downSpeed)}</td>
      <td class="mono num ul">${rowSpeed(t.upSpeed)}</td>
      <td class="mono num">${peers}</td>
      <td class="mono num">${eta}</td>
      <td class="mono num center" style="color:${ratioCol}">${(t.ratio || 0).toFixed(2)}</td>
      <td class="cell-act"><div class="row-actions">
        <button class="ibtn js-toggle" title="${paused ? "Tiếp tục" : "Tạm dừng"}">${svg(paused ? ICONS.play : ICONS.pause, 15)}</button>
        <button class="ibtn danger js-remove" title="Xóa">${svg(ICONS.trash, 15)}</button>
      </div></td>
    </tr>`;
  }).join("");
}

/* ---------- render: status bar ---------- */
function renderStatusbar() {
  const s = state.stats || {};
  let limit = "∞";
  if (s.downLimit || s.upLimit) {
    limit = (s.downLimit ? fmtSpeed(s.downLimit) : "∞") + " / " + (s.upLimit ? fmtSpeed(s.upLimit) : "∞");
  }
  $("statusbar").innerHTML =
    `<span class="sb-item"><span class="sb-dot live"></span> ${s.active || 0} đang hoạt động</span>
     <span class="sb-item dl">${svg(ICONS.download, 14)} <b class="mono">${fmtSpeed(s.downSpeed || 0)}</b></span>
     <span class="sb-item ul">${svg(ICONS.upload, 14)} <b class="mono">${fmtSpeed(s.upSpeed || 0)}</b></span>
     <span class="sb-spacer"></span>
     <span class="sb-item">${svg(ICONS.users, 14)} <span class="mono">${fmtNum(s.connections)}</span> kết nối</span>
     <span class="sb-item">${svg(ICONS.globe, 14)} DHT: <span class="mono">${fmtNum(s.dhtNodes)}</span> nodes</span>
     <span class="sb-item js-limit" title="Cài đặt giới hạn tốc độ">${svg(ICONS.bolt, 14)} Giới hạn: <span class="mono">${limit}</span></span>`;
  const lim = $("statusbar").querySelector(".js-limit");
  if (lim) lim.onclick = openSettings;
}

/* ---------- render: detail panel ---------- */
function renderDetail() {
  const aside = $("detail");
  const t = state.torrents.find((x) => x.infoHash === state.selected);
  if (!state.selected || !t) { aside.hidden = true; aside.innerHTML = ""; return; }
  aside.hidden = false;

  const st = STATUS[t.status] || STATUS.downloading;
  const pct = Math.min(100, t.progress || 0);
  const d = state.detail && state.detail.infoHash === state.selected ? state.detail : null;
  const fileCount = d ? d.files.length : (t.fileCount || 0);
  const peerCount = d ? d.peers.length : (t.peers || 0);
  const trackCount = d ? d.trackers.length : 0;

  const head = `
    <header class="detail-head">
      <div class="detail-title">
        <span class="cat-ico lg">${svg(ICONS[catKey(t.name)], 20)}</span>
        <div>
          <div class="detail-name" title="${esc(t.name)}">${esc(t.name)}</div>
          <div class="detail-sub mono">${t.totalBytes ? fmtBytes(t.totalBytes) : "—"} · <span class="pill" style="color:${st.color}"><span class="pill-dot" style="background:${st.color}"></span>${st.label}</span></div>
        </div>
      </div>
      <button class="ibtn js-close" title="Đóng">${svg(ICONS.close, 16)}</button>
    </header>`;

  const progress = `
    <div class="detail-progress">
      <div class="bar bar-lg"><div class="bar-fill" style="width:${pct}%;background:${barColor(t)}"></div></div>
      <div class="dp-stats">
        <span class="mono">${pct.toFixed(0)}%</span><span>·</span>
        <span class="mono">${fmtBytes(t.doneBytes)} / ${t.totalBytes ? fmtBytes(t.totalBytes) : "—"}</span><span>·</span>
        <span class="mono">${t.status === "downloading" && t.eta >= 0 ? "còn " + fmtEta(t.eta) : (t.status === "seeding" ? "đang seed" : st.label.toLowerCase())}</span>
      </div>
    </div>`;

  const kpis = `
    <div class="detail-kpis">
      ${kpi("download", "var(--accent)", rowSpeed(t.downSpeed), "Tốc độ tải")}
      ${kpi("upload", "var(--up)", rowSpeed(t.upSpeed), "Tốc độ lên")}
      ${kpi("users", null, (t.peers || 0) + " / " + (t.seeds || 0), "Peers / Seeds")}
      ${kpi("ratio", (t.ratio || 0) >= 1 ? "var(--up)" : null, (t.ratio || 0).toFixed(2), "Tỷ lệ chia sẻ")}
    </div>`;

  const chart = `
    <div class="detail-chart">
      <div class="chart-legend">
        <span><i style="background:${ACCENT}"></i> Tải xuống</span>
        <span><i style="background:${UP}"></i> Tải lên</span>
      </div>
      ${drawChart(state.chart.d, state.chart.u)}
    </div>`;

  const TABS = [
    { key: "files", label: "Tệp tin", ic: "folder", n: fileCount },
    { key: "peers", label: "Peers", ic: "users", n: peerCount },
    { key: "trackers", label: "Trackers", ic: "globe", n: trackCount },
    { key: "info", label: "Thông tin", ic: "info", n: null },
  ];
  const tabs = `<div class="tabs">${TABS.map((tb) =>
    `<button class="tab${state.tab === tb.key ? " active" : ""}" data-tab="${tb.key}">${svg(ICONS[tb.ic], 15)}${tb.label}${tb.n != null ? `<span class="tab-n mono">${tb.n}</span>` : ""}</button>`).join("")}</div>`;

  aside.innerHTML = head + progress + kpis + chart + tabs + `<div class="tab-body">${renderTabBody(t, d)}</div>`;

  aside.querySelector(".js-close").onclick = closeDetail;
  aside.querySelectorAll(".tab").forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; renderDetail(); });
  aside.querySelectorAll(".js-prio").forEach((b) => b.onclick = () => cyclePriority(t.infoHash, +b.dataset.idx, b.dataset.prio));
}
function kpi(ic, color, val, lbl) {
  const cs = color ? ` style="color:${color}"` : "";
  return `<div class="kpi"><span class="kpi-ico"${cs}>${svg(ICONS[ic], 15)}</span><div><div class="kpi-val mono"${cs}>${val}</div><div class="kpi-lbl">${lbl}</div></div></div>`;
}
function renderTabBody(t, d) {
  if (state.tab === "files") {
    if (!d || !d.files.length) return `<div class="tb-empty">Đang lấy danh sách tệp…</div>`;
    const PRIO = { hi: ["Cao", "prio-high"], normal: ["Thường", "prio-normal"], off: ["Tắt", "prio-low"] };
    return `<table class="subtable"><thead><tr><th>Tệp</th><th style="text-align:right">Cỡ</th><th style="width:120px">Tiến trình</th><th>Ưu tiên</th></tr></thead><tbody>${
      d.files.map((f) => { const p = PRIO[f.priority] || PRIO.normal; return `<tr>
        <td class="ft-name">${svg(ICONS.file, 14)}<span title="${esc(f.path)}">${esc(f.path)}</span></td>
        <td class="mono num">${fmtBytes(f.bytes)}</td>
        <td><div class="bar bar-sm"><div class="bar-fill" style="width:${Math.min(100, f.progress).toFixed(0)}%;background:${f.progress >= 100 ? "var(--up)" : "var(--accent)"}"></div></div></td>
        <td><span class="prio ${p[1]} js-prio" data-idx="${f.index}" data-prio="${f.priority}" title="Bấm để đổi ưu tiên">${p[0]}</span></td>
      </tr>`; }).join("")
    }</tbody></table>`;
  }
  if (state.tab === "peers") {
    if (!d || !d.peers.length) return `<div class="tb-empty">Chưa có peer nào.</div>`;
    return `<table class="subtable"><thead><tr><th>Địa chỉ</th><th>Client</th></tr></thead><tbody>${
      d.peers.map((p) => `<tr><td class="mono">${esc(p.addr)}</td><td>${esc(p.client) || "—"}</td></tr>`).join("")
    }</tbody></table>`;
  }
  if (state.tab === "trackers") {
    if (!d || !d.trackers.length) return `<div class="tb-empty">Không có tracker (magnet/DHT).</div>`;
    return `<table class="subtable"><thead><tr><th>Tracker</th><th style="text-align:right">Tier</th></tr></thead><tbody>${
      d.trackers.map((tr) => `<tr><td class="mono" title="${esc(tr.url)}">${esc(tr.url)}</td><td class="mono num">${tr.tier}</td></tr>`).join("")
    }</tbody></table>`;
  }
  // info
  const rows = [
    ["Mã băm (infohash)", t.infoHash],
    ["Tổng dung lượng", t.totalBytes ? fmtBytes(t.totalBytes) : "—"],
    ["Đã tải", fmtBytes(t.doneBytes)],
    ["Đã tải lên", fmtBytes(t.upBytes)],
    ["Số tệp", d ? d.files.length : t.fileCount],
    ["Số mảnh (pieces)", d && d.numPieces ? fmtNum(d.numPieces) : "—"],
    ["Kích thước mảnh", d && d.pieceLength ? fmtBytes(d.pieceLength) : "—"],
    ["Tạo bởi", (d && d.createdBy) || "—"],
    ["Ghi chú", (d && d.comment) || "—"],
  ];
  return `<table class="subtable info-table"><tbody>${
    rows.map(([k, v]) => `<tr><td class="ik">${k}</td><td class="iv mono" title="${esc(v)}">${esc(v)}</td></tr>`).join("")
  }</tbody></table>`;
}

/* ---------- chart ---------- */
function drawChart(dArr, uArr) {
  const W = 100, H = 100, n = Math.max(dArr.length, uArr.length);
  if (n < 2) return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>`;
  const max = Math.max(1, ...dArr, ...uArr);
  const pts = (arr) => { const step = W / (n - 1); return arr.map((v, i) => [i * step, H - (v / max) * H * 0.9 - 2]); };
  const area = (p) => { let s = `M0 ${H} `; p.forEach(([x, y]) => s += `L${x.toFixed(1)} ${y.toFixed(1)} `); return s + `L${W} ${H} Z`; };
  const line = (p) => p.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const dp = pts(dArr), up = pts(uArr);
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${area(dp)}" fill="${ACCENT}" opacity="0.10"/>
    <path d="${area(up)}" fill="${UP}" opacity="0.10"/>
    <path d="${line(up)}" fill="none" stroke="${UP}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <path d="${line(dp)}" fill="none" stroke="${ACCENT}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/* ---------- selection ---------- */
function selectTorrent(hash) {
  if (state.selected === hash) return;
  state.selected = hash;
  state.detail = null;
  state.chart = { hash, d: [], u: [] };
  fetchDetail();
  renderRows(); renderDetail();
}
function closeDetail() {
  state.selected = null; state.detail = null;
  renderRows(); renderDetail();
}
function fetchDetail() {
  const h = state.selected; if (!h) return;
  Promise.resolve(api().GetDetail(h)).then((d) => {
    if (state.selected === h) { state.detail = d; renderDetail(); }
  }).catch(() => {});
}

/* ---------- snapshot ---------- */
function onSnapshot(snap) {
  if (!snap) return;
  state.torrents = snap.torrents || [];
  state.stats = snap.stats || {};
  // selected gone?
  if (state.selected && !state.torrents.some((t) => t.infoHash === state.selected)) {
    state.selected = null; state.detail = null;
  }
  // chart history for selected
  if (state.selected) {
    const t = state.torrents.find((x) => x.infoHash === state.selected);
    if (t) {
      if (state.chart.hash !== state.selected) state.chart = { hash: state.selected, d: [], u: [] };
      state.chart.d.push(t.downSpeed || 0); state.chart.u.push(t.upSpeed || 0);
      if (state.chart.d.length > 60) { state.chart.d.shift(); state.chart.u.shift(); }
    }
    fetchDetail();
  }
  renderNav(); renderRows(); renderStatusbar(); renderDetail();
}

/* ---------- actions ---------- */
function cyclePriority(hash, idx, cur) {
  const next = cur === "normal" ? "hi" : cur === "hi" ? "off" : "normal";
  Promise.resolve(api().SetFilePriority(hash, idx, next)).then(() => setTimeout(fetchDetail, 120));
}

/* ---------- modals ---------- */
function closeModal() { $("modal-host").innerHTML = ""; }
function modal(html) {
  $("modal-host").innerHTML = `<div class="modal-overlay">${html}</div>`;
  const ov = $("modal-host").firstElementChild;
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closeModal(); });
  return ov;
}
function openAdd() {
  const ov = modal(`
    <div class="modal">
      <header class="modal-head"><h2>Thêm torrent</h2><button class="ibtn js-x">${svg(ICONS.close, 16)}</button></header>
      <div class="modal-body">
        <label class="field-lbl">Magnet link</label>
        <input id="m-magnet" class="field-in" placeholder="magnet:?xt=urn:btih:…" spellcheck="false" autofocus />
        <div class="or-row"><span></span><b>hoặc</b><span></span></div>
        <button class="btn block" id="m-file">${svg(ICONS.file, 16)} Mở file .torrent…</button>
        <p class="field-hint">Mẹo: kéo–thả file <b>.torrent</b> vào cửa sổ cũng được.</p>
      </div>
      <footer class="modal-foot"><button class="btn js-x">Hủy</button><button class="btn primary" id="m-add">Thêm</button></footer>
    </div>`);
  ov.querySelectorAll(".js-x").forEach((b) => b.onclick = closeModal);
  const inp = ov.querySelector("#m-magnet");
  const add = () => {
    const v = inp.value.trim(); if (!v) return;
    Promise.resolve(api().AddMagnet(v)).then((err) => { if (err) toast("Lỗi: " + err); else closeModal(); });
  };
  ov.querySelector("#m-add").onclick = add;
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  ov.querySelector("#m-file").onclick = () => {
    Promise.resolve(api().AddTorrentFile()).then((err) => { if (err) toast("Lỗi: " + err); else closeModal(); });
  };
  setTimeout(() => inp.focus(), 30);
}
function openSettings() {
  Promise.resolve(api().GetSettings()).then((s) => {
    s = s || {};
    const ov = modal(`
      <div class="modal">
        <header class="modal-head"><h2>Cài đặt</h2><button class="ibtn js-x">${svg(ICONS.close, 16)}</button></header>
        <div class="modal-body">
          <label class="field-lbl">Thư mục lưu</label>
          <div class="field-row">
            <input id="s-dir" class="field-in" readonly value="${esc(s.downloadDir)}" />
            <button class="btn" id="s-pick">${svg(ICONS.folder, 16)} Chọn</button>
          </div>
          <label class="field-lbl">Giới hạn tải xuống (KB/s)</label>
          <input id="s-down" class="field-in mono" type="number" min="0" value="${s.downKBps || ""}" placeholder="0 = không giới hạn" />
          <label class="field-lbl">Giới hạn tải lên (KB/s)</label>
          <input id="s-up" class="field-in mono" type="number" min="0" value="${s.upKBps || ""}" placeholder="0 = không giới hạn" />
          <p class="field-hint">Đổi thư mục sẽ nạp lại các torrent hiện có vào vị trí mới.</p>
        </div>
        <footer class="modal-foot"><button class="btn js-x">Hủy</button><button class="btn primary" id="s-save">Lưu</button></footer>
      </div>`);
    ov.querySelectorAll(".js-x").forEach((b) => b.onclick = closeModal);
    ov.querySelector("#s-pick").onclick = () => {
      Promise.resolve(api().ChooseDownloadDir()).then((p) => { if (p) ov.querySelector("#s-dir").value = p; });
    };
    ov.querySelector("#s-save").onclick = () => {
      const payload = {
        downloadDir: ov.querySelector("#s-dir").value,
        downKBps: parseInt(ov.querySelector("#s-down").value || "0", 10) || 0,
        upKBps: parseInt(ov.querySelector("#s-up").value || "0", 10) || 0,
      };
      Promise.resolve(api().SaveSettings(payload)).then((err) => {
        if (err) toast("Lỗi: " + err); else { closeModal(); toast("Đã lưu cài đặt"); }
      });
    };
  });
}

/* ---------- drag & drop overlay (file thực sự do Go xử lý qua OnFileDrop) ---------- */
let dragDepth = 0;
function setupDnd() {
  const ov = $("drop-overlay");
  window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; ov.hidden = false; });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; ov.hidden = true; } });
  window.addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; ov.hidden = true; });
}

/* ---------- bootstrap ---------- */
function injectIcons() {
  document.querySelectorAll("[data-ic]").forEach((el) => {
    const key = el.dataset.ic;
    if (ICONS[key]) el.innerHTML = svg(ICONS[key], el.classList.contains("brand-mark") ? 18 : el.classList.contains("empty-ic") ? 26 : 16);
  });
}
function init() {
  injectIcons();
  renderNav(); renderStatusbar();

  $("btn-add").onclick = openAdd;
  $("btn-add-empty").onclick = openAdd;
  $("btn-settings").onclick = openSettings;
  $("btn-resume-all").onclick = () => api().ResumeAll();
  $("btn-pause-all").onclick = () => api().PauseAll();
  $("search").addEventListener("input", (e) => { state.search = e.target.value; renderRows(); });

  // nav (event delegation)
  $("nav").addEventListener("click", (e) => {
    const b = e.target.closest(".nav-item"); if (!b) return;
    state.filter = b.dataset.filter; renderNav(); renderRows();
  });

  // sort headers
  document.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
    document.querySelectorAll("th.sortable").forEach((x) => x.classList.remove("asc", "desc"));
    th.classList.add(state.sort.dir > 0 ? "asc" : "desc");
    renderRows();
  }));

  // row clicks (select / pause / remove)
  $("rows").addEventListener("click", (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    const hash = tr.dataset.hash;
    if (e.target.closest(".js-toggle")) {
      const t = state.torrents.find((x) => x.infoHash === hash);
      if (t && t.status === "paused") api().ResumeTorrent(hash); else api().PauseTorrent(hash);
    } else if (e.target.closest(".js-remove")) {
      api().RemoveTorrent(hash);
      if (state.selected === hash) closeDetail();
    } else {
      selectTorrent(hash);
    }
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if ($("modal-host").innerHTML) closeModal(); else if (state.selected) closeDetail(); } });

  setupDnd();

  window.runtime.EventsOn("torrents:update", onSnapshot);
  Promise.resolve(api().GetSnapshot()).then(onSnapshot).catch(() => {});
}

if (window.runtime && window.go) init();
else window.addEventListener("DOMContentLoaded", () => {
  const w = setInterval(() => { if (window.runtime && window.go) { clearInterval(w); init(); } }, 50);
});
