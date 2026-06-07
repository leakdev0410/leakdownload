import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './icons.jsx';
import { SpeedChart } from './chart.jsx';
import { fmtBytes, fmtSpeed, fmtEta } from '../utils.js';
import { StatusPill, ProgressView } from './components.jsx';
import { useAnimatedNumber } from '../useAnimatedNumber.js';

function DetailPanel({ torrent, history, accent, onClose, onFileToggle }) {
  const [tab, setTab] = useState("files");
  const [detail, setDetail] = useState(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (torrent && torrent.hash) {
      const id = ++reqRef.current;
      window.go.main.App.GetDetail(torrent.hash).then(d => {
        if (id === reqRef.current) setDetail(d);
      }).catch(() => {});
    } else {
      setDetail(null);
    }
  }, [torrent?.hash]);

  if (!torrent) return null;
  const t = { ...torrent, files: detail?.files || [], peers: detail?.peers || [], trackers: detail?.trackers || [] };
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

  return (
    <table className="subtable">
      <thead><tr><th>Tệp</th><th style={{ textAlign: "right" }}>Cỡ</th><th style={{ width: 120 }}>Tiến trình</th><th>Ưu tiên</th></tr></thead>
      <tbody>
        {files.map((f, i) => (
          <tr key={i}>
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
  const rows = [
    ["Tên", t.name],
    ["Info hash (v1)", t.hash],
    ["Tổng dung lượng", fmtBytes(t.size)],
    ["Đã tải", fmtBytes(t.size * t.progress)],
    ["Đã chia sẻ", fmtBytes(t.upBytes || 0)],
    ["Số tệp", (t.files || []).length + " tệp"],
    ["Thêm vào", t.added],
    ["Lưu tại", "~/Downloads/torrnet/"],
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
  const valid = mode === "magnet" ? magnet.trim().toLowerCase().startsWith("magnet:") : !!fileName;

  function handleFile(f) {
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result);
        let b64 = "";
        for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]);
        setFileData(btoa(b64));
      } catch { setFileData(null); }
    };
    reader.readAsArrayBuffer(f);
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Thêm torrent mới</h3>
          <button className="ibtn" onClick={onClose}><Icon name="close" size={18} /></button>
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
          <button className="btn ghost" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={!valid} onClick={() => { onAdd({ mode, magnet, fileData, startNow, skipHash }); onClose(); }}>
            <Icon name="plus" size={15} /> Thêm torrent
          </button>
        </footer>
      </div>
    </div>
  );
}

function SettingsModal({ open, onClose }) {
  const [settings, setSettings] = useState({ downloadDir: "", downKBps: 0, upKBps: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      setLoading(true);
      window.go.main.App.GetSettings().then(s => {
        setSettings(s || { downloadDir: "", downKBps: 0, upKBps: 0 });
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [open]);

  function save() {
    window.go.main.App.SaveSettings(settings).then(e => {
      if (e) alert(e); else onClose();
    }).catch(e => alert("Lỗi: " + e));
  }

  function chooseDir() {
    window.go.main.App.ChooseDownloadDir().then(path => {
      if (path) setSettings(s => ({ ...s, downloadDir: path }));
    }).catch(() => {});
  }

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 500 }}>
        <header className="modal-head">
          <h3>Cài đặt</h3>
          <button className="ibtn" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        {loading ? (
          <div className="modal-body" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Đang tải...</div>
        ) : (
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="fld-lbl">Thư mục lưu</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="magnet-in" style={{ height: 38, flex: 1 }} value={settings.downloadDir} onChange={e => setSettings(s => ({ ...s, downloadDir: e.target.value }))} placeholder="~/Downloads/leakdownload" />
                <button className="btn ghost" onClick={chooseDir} style={{ height: 38 }}><Icon name="folder" size={15} /> Chọn</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="fld-lbl">Giới hạn tải xuống (KB/s, 0 = vô hạn)</label>
                <input className="magnet-in" style={{ height: 38 }} type="number" min={0} value={settings.downKBps} onChange={e => setSettings(s => ({ ...s, downKBps: Math.max(0, parseInt(e.target.value) || 0) }))} />
              </div>
              <div>
                <label className="fld-lbl">Giới hạn tải lên (KB/s, 0 = vô hạn)</label>
                <input className="magnet-in" style={{ height: 38 }} type="number" min={0} value={settings.upKBps} onChange={e => setSettings(s => ({ ...s, upKBps: Math.max(0, parseInt(e.target.value) || 0) }))} />
              </div>
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
      <span className="sb-item"><Icon name="bolt" size={14} /> Giới hạn: <span className="mono">↓{fmtLimit(downLimit)} ↑{fmtLimit(upLimit)}</span></span>
    </footer>
  );
}

export { DetailPanel, AddModal, StatusBar, SettingsModal };
