const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;

function fmtBytes(b) {
  if (b == null) return "—";
  if (b >= GiB) return (b / GiB).toFixed(2) + " GB";
  if (b >= MiB) return (b / MiB).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(0) + " KB";
  return b + " B";
}
function fmtSpeed(bps) {
  if (!bps) return "0 KB/s";
  if (bps >= MiB) return (bps / MiB).toFixed(1) + " MB/s";
  if (bps >= 1024) return (bps / 1024).toFixed(0) + " KB/s";
  return bps + " B/s";
}
function fmtEta(sec) {
  if (sec == null || sec === Infinity) return "∞";
  if (sec <= 0) return "—";
  if (sec < 60) return Math.round(sec) + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m " + Math.round(sec % 60) + "s";
  if (sec < 86400) return Math.floor(sec / 3600) + "h " + Math.floor((sec % 3600) / 60) + "m";
  return Math.floor(sec / 86400) + "d " + Math.floor((sec % 86400) / 3600) + "h";
}

export { fmtBytes, fmtSpeed, fmtEta };
