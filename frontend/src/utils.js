const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;

function safeNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

function fmtBytes(b) {
  const v = safeNum(b);
  if (v == null) return "—";
  if (v >= GiB) return (v / GiB).toFixed(2) + " GB";
  if (v >= MiB) return (v / MiB).toFixed(1) + " MB";
  if (v >= 1024) return (v / 1024).toFixed(0) + " KB";
  return Math.round(v) + " B";
}

function fmtSpeed(bps) {
  const v = safeNum(bps);
  if (v == null || v === 0) return "0 KB/s";
  if (v >= MiB) return (v / MiB).toFixed(1) + " MB/s";
  if (v >= 1024) return (v / 1024).toFixed(0) + " KB/s";
  return Math.round(v) + " B/s";
}

function fmtEta(sec) {
  if (sec == null || sec === Infinity || sec < 0 || Number.isNaN(sec) || !Number.isFinite(sec)) return "∞";
  const s = Math.round(sec);
  if (s <= 0) return "—";
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s";
  if (s < 86400) return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
  return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
}

export { fmtBytes, fmtSpeed, fmtEta };
