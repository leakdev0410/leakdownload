import { useState, useEffect } from 'react';
import { Icon } from './icons.jsx';
import { SpeedChart } from './chart.jsx';
import { fmtBytes, fmtSpeed, fmtEta } from '../utils.js';
import { StatusPill, ProgressView } from './components.jsx';
import { useAnimatedNumber } from '../useAnimatedNumber.js';
import {
  GetDetail, GetSettings, SaveSettings, ChooseDownloadDir, OpenDownloadDir,
} from '../wailsjs/go/main/App.js';

const DEFAULT_SETTINGS = {
  downloadDir: "",
  downKBps: 0,
  upKBps: 0,
  enableApibay: true,
  enableTorrentsCSV: true,
  jackettURL: "",
  jackettAPIKey: "",
};

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function DetailPanel({ torrent, history, accent, onClose, onFileToggle }) {
  const [tab, setTab] = useState("files");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const hash = torrent.hash;
    const fetchDetail = () => {
      GetDetail(hash).then(d => {
        if (!cancelled) setDetail(d);
      }).catch(() => {});
    };
    fetchDetail();
    const timer = setInterval(fetchDetail, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [torrent.hash]);

  if (!torrent) return null;
  const t = {
    ...torrent,
    files: detail?.files || [],
    peers: detail?.peers || [],
    trackers: detail?.trackers || [],
    pieceLength: detail?.pieceLength,
    numPieces: detail?.numPieces,
    comment: detail?.comment,
    createdBy: detail?.createdBy,
  };
  const eta = t.status === "downloading" && t.down > 0 ? (t.size * (1 - t.progress)) / t.down : (t.progress >= 1 ? 0 : Infinity);
  const ratio = t.ratio ?? 0;

  const TABS = [
    { id: "files", label: "Tệp tin", icon: "folder", n: t.files.length },
    { id: "peers", label: "Peers", icon: "peers", n: t.peers.length },
    { id: "trackers", label: "Trackers", icon: "globe", n: t.trackers.length },
    { id: "info", label: "Thông tin", icon: "info" },
  ];

  return (
    <aside className="detail">
      <header className="detail-head">
        <div className="detail-title">
          <span className="cat-ico lg"><Icon name="file" size={18} /></span>
          <div>
            <div className="detail-name" title={t.name}>{t.name}</div>
            <div className="detail-sub mono">{fmtBytes(t.size)} · <StatusPill status={t.status} /></div>
          </div>
        </div>
        <button className="ibtn" onClick={onClose} title="Đóng"><Icon name="close" size={18} /></button>
      </header>

      <div className="detail-progress">
        <ProgressView value={t.progress} status={t.status} style="bar" size="lg" />
        <div className="dp-stats">
          <span className="mono">{Math.round(t.progress * 100)}%</span>
          <span>·</span>
          <span className="mono">{fmtBytes(t.size * t.progress)} / {fmtBytes(t.size)}</span>
          {t.status === "downloading" && <><span>·</span><span className="mono">còn {fmtEta(eta)}</span></>}
        </div>
      </div>

      <div className="detail-kpis">
        <AnimatedKPI icon="download" label="Tốc độ tải" bps={t.down} color="var(--accent)" />
        <AnimatedKPI icon="upload" label="Tốc độ lên" bps={t.up} color="var(--up)" />
        <KPI icon="peers" label="Peers / Seeds" value={`${t.peers} / ${t.seeds}`} />
        <KPI icon="seed" label="Tỷ lệ chia sẻ" value={ratio.toFixed(2)} color={ratio >= 1 ? "var(--up)" : undefined} />
      </div>

      <div className="detail-chart">
        <div className="chart-legend">
          <span><i style={{ background: accent }} /> Tải xuống</span>
          <span><i style={{ background: "var(--up)" }} /> Tải lên</span>
        </div>
        <SpeedChart history={history} accent={accent} height={108} />
      </div>

      <div className="tabs">
        {TABS.map((tb) => (
          <button key={tb.id} className={"tab" + (tab === tb.id ? " active" : "")} onClick={() => setTab(tb.id)}>
            <Icon name={tb.icon} size={15} />{tb.label}{tb.n != null && <span className="tab-n mono">{tb.n}</span>}
          </button>
        ))}
      </div>

      <div className="tab-body">
        {tab === "files" && <div className="tab-fade" key="files"><FilesTab files={t.files} hash={t.hash} onFileToggle={onFileToggle} /></div>}
        {tab === "peers" && <div className="tab-fade" key="peers"><PeersTab peers={t.peers} /></div>}
        {tab === "trackers" && <div className="tab-fade" key="trackers"><TrackersTab trackers={t.trackers} /></div>}
        {tab === "info" && <div className="tab-fade" key="info"><InfoTab t={t} /></div>}
      </div>
    </aside>
  );
}

function KPI({ icon, label, value, color }) {
  return (
    <div className="kpi">
      <span className="kpi-ico" style={color ? { color } : undefined}><Icon name={icon} size={15} /></span>
      <div>
        <div className="kpi-val mono" style={color ? { color } : undefined}>{value}</div>
        <div className="kpi-lbl">{label}</div>
      </div>
    </div>
  );
}

function AnimatedKPI({ icon, label, bps, color }) {
  const v = useAnimatedNumber(bps || 0, 350);
  const display = bps ? fmtSpeed(Math.round(v)) : "—";
  return (
    <div className="kpi">
      <span className="kpi-ico" style={color ? { color } : undefined}><Icon name={icon} size={15} /></span>
      <div>
        <div className="kpi-val mono" style={color ? { color } : undefined}>{display}</div>
        <div className="kpi-lbl">{label}</div>
      </div>
    </div>
  );
}

function FilesTab({ files, hash, onFileToggle }) {
  function cyclePriority(f, activeHash) {
    if (!onFileToggle || !activeHash) return;
    const next = f.priority === "hi" ? "off" : f.priority === "off" ? "normal" : "hi";
    onFileToggle(activeHash, f.index, next);
  }

  if (!files.length) return <div className="empty-sm">Chưa có danh sách tệp (đang lấy metadata…)</div>;

  return (
    <table className="subtable">
      <thead><tr><th>Tệp</th><th style={{ textAlign: "right" }}>Cỡ</th><th style={{ width: 120 }}>Tiến trình</th><th>Ưu tiên</th></tr></thead>
      <tbody>
        {files.map((f) => (
          <tr key={f.index}>
            <td className="ft-name"><Icon name="file" size={14} /><span title={f.path}>{f.path.split("/").pop()}</span></td>
            <td className="mono num">{fmtBytes(f.bytes)}</td>
            <td><div className="bar bar-sm"><div className="bar-fill" style={{ width: Math.min(f.progress || 0, 100) + "%", background: (f.progress || 0) >= 100 ? "var(--up)" : "var(--accent)" }} /></div></td>
            <td>
              <button
                className={"prio prio-" + (f.priority === "hi" ? "high" : f.priority === "off" ? "low" : "normal")}
                onClick={() => cyclePriority(f, hash)}
                style={{ cursor: "pointer", border: "none", fontFamily: "inherit" }}
              >
                {f.priority === "hi" ? "Cao" : f.priority === "off" ? "Tắt" : "Thường"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PeersTab({ peers }) {
  if (!peers.length) return <div className="empty-sm">Không có peer nào đang kết nối.</div>;
  return (
    <table className="subtable">
      <thead><tr><th>Địa chỉ IP</th><th>Client</th></tr></thead>
      <tbody>
        {peers.map((p, i) => (
          <tr key={i}>
            <td className="mono">{p.addr}</td>
            <td className="client">{p.client || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrackersTab({ trackers }) {
  if (!trackers.length) return <div className="empty-sm">Chưa có tracker.</div>;
  return (
    <table className="subtable">
      <thead><tr><th>URL</th><th style={{ textAlign: "right" }}>Tier</th></tr></thead>
      <tbody>
        {trackers.map((t, i) => (
          <tr key={i}>
            <td className="mono tk-url" title={t.url}>{t.url}</td>
            <td className="mono num">{t.tier}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InfoTab({ t }) {
  const fileCount = t.fileCount || (t.files || []).length || 0;
  const rows = [
    ["Tên", t.name],
    ["Info hash (v1)", t.hash],
    ["Tổng dung lượng", fmtBytes(t.size)],
    ["Đã tải", fmtBytes(t.size * t.progress)],
    ["Đã chia sẻ", fmtBytes(t.upBytes || 0)],
    ["Số tệp", fileCount + " tệp"],
    ["Piece length", t.pieceLength ? fmtBytes(t.pieceLength) : "—"],
    ["Số piece", t.numPieces != null ? String(t.numPieces) : "—"],
    ["Comment", t.comment || "—"],
    ["Created by", t.createdBy || "—"],
  ];
  return (
    <div className="info-grid">
      {rows.map(([k, v], i) => (
        <div className="info-row" key={i}><div className="info-k">{k}</div><div className="info-v mono" title={v}>{v}</div></div>
      ))}
    </div>
  );
}

function AddModal({ open, onClose, onAdd }) {
  const [mode, setMode] = useState("magnet");
  const [magnet, setMagnet] = useState("");
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileData, setFileData] = useState(null);
  const [startNow, setStartNow] = useState(true);
  const [skipHash, setSkipHash] = useState(false);

  if (!open) return null;
  const valid = mode === "magnet"
    ? magnet.trim().toLowerCase().startsWith("magnet:")
    : !!(fileName && fileData);

  function resetForm() {
    setMode("magnet");
    setMagnet("");
    setFileName("");
    setFileData(null);
    setStartNow(true);
    setSkipHash(false);
    setDrag(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleFile(f) {
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result);
        setFileData(bytesToBase64(bytes));
      } catch {
        setFileData(null);
      }
    };
    reader.readAsArrayBuffer(f);
  }

  function submit() {
    onAdd({ mode, magnet, fileData, startNow, skipHash });
    resetForm();
    onClose();
  }

  return (
    <div className="modal-scrim" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Thêm torrent mới</h3>
          <button className="ibtn" onClick={handleClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="seg">
          <button className={mode === "magnet" ? "on" : ""} onClick={() => setMode("magnet")}><Icon name="magnet" size={15} /> Magnet link</button>
          <button className={mode === "file" ? "on" : ""} onClick={() => setMode("file")}><Icon name="file" size={15} /> Tệp .torrent</button>
        </div>
        {mode === "magnet" ? (
          <div className="modal-body">
            <label className="fld-lbl">Dán magnet link</label>
            <textarea className="magnet-in mono" placeholder="magnet:?xt=urn:btih:..." value={magnet} onChange={(e) => setMagnet(e.target.value)} autoFocus />
            <div className="hint">Hỗ trợ BitTorrent v1 & v2 · DHT · PeX</div>
          </div>
        ) : (
          <div className="modal-body">
            <label
              className={"dropzone" + (drag ? " over" : "") + (fileName ? " has" : "")}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
            >
              <input type="file" accept=".torrent" hidden onChange={(e) => handleFile(e.target.files[0])} />
              <Icon name={fileName ? "check" : "upload"} size={26} />
              <div className="dz-main">{fileName || "Kéo thả tệp .torrent vào đây"}</div>
              <div className="dz-sub">{fileName ? "Sẵn sàng thêm" : "hoặc bấm để chọn tệp"}</div>
            </label>
          </div>
        )}
        <div className="modal-opts">
          <label className="opt"><input type="checkbox" checked={startNow} onChange={e => setStartNow(e.target.checked)} /> Bắt đầu tải ngay</label>
          <label className="opt"><input type="checkbox" checked={skipHash} onChange={e => setSkipHash(e.target.checked)} /> Bỏ qua kiểm tra hash</label>
        </div>
        <footer className="modal-foot">
          <button className="btn ghost" onClick={handleClose}>Hủy</button>
          <button className="btn primary" disabled={!valid} onClick={submit}>
            <Icon name="plus" size={15} /> Thêm torrent
          </button>
        </footer>
      </div>
    </div>
  );
}

function SettingsModal({ open, onClose }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    GetSettings().then(s => {
      if (cancelled) return;
      setSettings(s || { ...DEFAULT_SETTINGS });
      setLoadError("");
      setReady(true);
    }).catch(e => {
      if (cancelled) return;
      setSettings({ ...DEFAULT_SETTINGS });
      setLoadError(String(e));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [open]);

  function save() {
    SaveSettings(settings).then(e => {
      if (e) alert(e); else onClose();
    }).catch(e => alert("Lỗi: " + e));
  }

  function chooseDir() {
    ChooseDownloadDir().then(path => {
      if (path) setSettings(s => ({ ...s, downloadDir: path }));
    }).catch(() => {});
  }

  function openDir() {
    OpenDownloadDir().catch(() => {});
  }

  if (!open) return null;

  const loading = !ready;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxHeight: "90vh", overflow: "auto" }}>
        <header className="modal-head">
          <h3>Cài đặt</h3>
          <button className="ibtn" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        {loading ? (
          <div className="modal-body" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Đang tải...</div>
        ) : (
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {loadError && <div className="hint" style={{ color: "var(--warn)" }}>Không tải được cài đặt: {loadError}</div>}
            <div>
              <label className="fld-lbl">Thư mục lưu</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="magnet-in" style={{ height: 38, flex: 1 }} value={settings.downloadDir || ""} onChange={e => setSettings(s => ({ ...s, downloadDir: e.target.value }))} placeholder="~/Downloads/leakdownload" />
                <button className="btn ghost" onClick={chooseDir} style={{ height: 38 }} title="Chọn thư mục"><Icon name="folder" size={15} /> Chọn</button>
                <button className="btn ghost" onClick={openDir} style={{ height: 38 }} title="Mở thư mục"><Icon name="globe" size={15} /> Mở</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="fld-lbl">Giới hạn tải xuống (KB/s, 0 = vô hạn)</label>
                <input className="magnet-in" style={{ height: 38 }} type="number" min={0} value={settings.downKBps ?? 0} onChange={e => setSettings(s => ({ ...s, downKBps: Math.max(0, parseInt(e.target.value) || 0) }))} />
              </div>
              <div>
                <label className="fld-lbl">Giới hạn tải lên (KB/s, 0 = vô hạn)</label>
                <input className="magnet-in" style={{ height: 38 }} type="number" min={0} value={settings.upKBps ?? 0} onChange={e => setSettings(s => ({ ...s, upKBps: Math.max(0, parseInt(e.target.value) || 0) }))} />
              </div>
            </div>

            <div className="settings-section">
              <div className="fld-lbl" style={{ marginBottom: 10 }}>Nguồn tìm kiếm</div>
              <div className="settings-checks">
                <label className="opt">
                  <input
                    type="checkbox"
                    checked={settings.enableApibay !== false}
                    onChange={e => setSettings(s => ({ ...s, enableApibay: e.target.checked }))}
                  />
                  Nguồn công khai (APIBay)
                </label>
                <label className="opt">
                  <input
                    type="checkbox"
                    checked={settings.enableTorrentsCSV !== false}
                    onChange={e => setSettings(s => ({ ...s, enableTorrentsCSV: e.target.checked }))}
                  />
                  Torrents-CSV
                </label>
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="fld-lbl">Jackett / Prowlarr URL</label>
                <input
                  className="magnet-in"
                  style={{ height: 38 }}
                  value={settings.jackettURL || ""}
                  onChange={e => setSettings(s => ({ ...s, jackettURL: e.target.value }))}
                  placeholder="http://127.0.0.1:9117"
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <label className="fld-lbl">API key</label>
                <input
                  className="magnet-in"
                  style={{ height: 38 }}
                  type="password"
                  autoComplete="off"
                  value={settings.jackettAPIKey || ""}
                  onChange={e => setSettings(s => ({ ...s, jackettAPIKey: e.target.value }))}
                  placeholder="API key từ Jackett / Prowlarr"
                />
              </div>
              <div className="hint">Prowlarr: dán base URL + API key (Torznab / Jackett-compatible). Để trống nếu chỉ dùng nguồn công khai.</div>
            </div>
          </div>
        )}
        <footer className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Hủy</button>
          <button className="btn primary" onClick={save} disabled={loading}><Icon name="check" size={15} /> Lưu</button>
        </footer>
      </div>
    </div>
  );
}

function StatusBar({ totalDown, totalUp, active, connections, dht, downLimit, upLimit }) {
  const fmtLimit = (v) => v ? fmtSpeed(v) : "∞";
  const animDown = useAnimatedNumber(totalDown || 0, 400);
  const animUp = useAnimatedNumber(totalUp || 0, 400);
  const ds = totalDown ? fmtSpeed(Math.round(animDown)) : "0 KB/s";
  const us = totalUp ? fmtSpeed(Math.round(animUp)) : "0 KB/s";
  return (
    <footer className="statusbar">
      <span className="sb-item"><span className="sb-dot live" /> {active} đang hoạt động</span>
      <span className="sb-item dl"><Icon name="download" size={14} /> <b className="mono">{ds}</b></span>
      <span className="sb-item ul"><Icon name="upload" size={14} /> <b className="mono">{us}</b></span>
      <span className="sb-spacer" />
      <span className="sb-item"><Icon name="peers" size={14} /> <span className="mono">{connections}</span> kết nối</span>
      <span className="sb-item"><Icon name="globe" size={14} /> DHT: <span className="mono">{dht}</span></span>
      <span className="sb-item"><Icon name="bolt" size={14} /> Giới hạn: <span className="mono">↓{fmtLimit(downLimit)} ↑{fmtLimit(upLimit)}</span></span>
    </footer>
  );
}

export { DetailPanel, AddModal, StatusBar, SettingsModal };
