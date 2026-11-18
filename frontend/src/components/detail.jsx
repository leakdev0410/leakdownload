import { useState, useEffect } from 'react';
import { Icon } from './icons.jsx';
import { SpeedChart } from './chart.jsx';
import { fmtBytes, fmtSpeed, fmtEta } from '../utils.js';
import { StatusPill, ProgressView, Segmented, Switch, Dialog } from './components.jsx';
import { useAnimatedNumber } from '../useAnimatedNumber.js';
import { toast } from '../ui.js';
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
  maxActiveDownloads: 0,
  notifyOnComplete: true,
  blockSeed: true, // mặc định chặn seed
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
  // peers/seeds trên torrent là số đếm; peerList/trackers/files lấy từ detail.
  const fileList = detail?.files || [];
  const peerList = detail?.peers || [];
  const trackerList = detail?.trackers || [];
  const t = {
    ...torrent,
    files: fileList,
    trackers: trackerList,
    pieceLength: detail?.pieceLength,
    numPieces: detail?.numPieces,
    comment: detail?.comment,
    createdBy: detail?.createdBy,
  };
  const eta = t.status === "downloading" && t.down > 0 ? (t.size * (1 - t.progress)) / t.down : (t.progress >= 1 ? 0 : Infinity);
  const ratio = t.ratio ?? 0;

  const TABS = [
    { id: "files", label: "Tệp tin", icon: "folder", n: fileList.length },
    { id: "peers", label: "Peers", icon: "peers", n: peerList.length },
    { id: "trackers", label: "Trackers", icon: "globe", n: trackerList.length },
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
        <AnimatedKPI icon="download" label="Tốc độ tải" bps={t.down} color="var(--link)" />
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
        <Segmented
          className="seg-fill"
          label="Chi tiết torrent"
          value={tab}
          onChange={setTab}
          items={TABS.map((tb) => ({ id: tb.id, label: tb.label, badge: tb.n }))}
        />
      </div>

      <div className="tab-body" role="tabpanel">
        {tab === "files" && <div className="tab-fade" key="files"><FilesTab files={fileList} hash={t.hash} onFileToggle={onFileToggle} /></div>}
        {tab === "peers" && <div className="tab-fade" key="peers"><PeersTab peers={peerList} /></div>}
        {tab === "trackers" && <div className="tab-fade" key="trackers"><TrackersTab trackers={trackerList} /></div>}
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
  const display = fmtSpeed(Math.round(v));
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
                title="Bấm để đổi ưu tiên"
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
          <tr key={p.addr || `peer-${i}`}>
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
          <tr key={`${t.tier ?? 0}:${t.url || i}`}>
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
  // Remount body mỗi lần mở → state sạch.
  if (!open) return null;
  return <AddModalBody onClose={onClose} onAdd={onAdd} />;
}

function AddModalBody({ onClose, onAdd }) {
  const [mode, setMode] = useState("magnet");
  const [magnet, setMagnet] = useState("");
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileData, setFileData] = useState(null);
  const [startNow, setStartNow] = useState(true);
  const [skipHash, setSkipHash] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const valid = mode === "magnet"
    ? magnet.trim().toLowerCase().startsWith("magnet:")
    : !!(fileName && fileData);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  function handleFile(f) {
    if (!f) return;
    const name = f.name || "";
    if (!/\.torrent$/i.test(name)) {
      toast("Chỉ hỗ trợ file .torrent");
      return;
    }
    setFileName(name);
    setFileData(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setFileName("");
      setFileData(null);
      toast("Không đọc được file");
    };
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result);
        setFileData(bytesToBase64(bytes));
      } catch {
        setFileName("");
        setFileData(null);
        toast("Không mã hóa được file torrent");
      }
    };
    reader.readAsArrayBuffer(f);
  }

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const err = await onAdd({ mode, magnet, fileData, startNow, skipHash });
      if (err) {
        toast(err);
        setSubmitting(false);
        return;
      }
      onClose();
    } catch (e) {
      toast("Lỗi: " + (e?.message || e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog className="dlg-md" labelledBy="add-title" onClose={handleClose}>
      <header className="modal-head">
        <h3 id="add-title">Thêm torrent mới</h3>
        <button className="ibtn" onClick={handleClose} disabled={submitting} aria-label="Đóng"><Icon name="close" size={18} /></button>
      </header>
      <div className="modal-seg">
        <Segmented
          className="seg-fill"
          label="Cách thêm"
          value={mode}
          onChange={(m) => { if (!submitting) setMode(m); }}
          items={[
            { id: "magnet", label: "Magnet link", icon: "magnet" },
            { id: "file", label: "Tệp .torrent", icon: "file" },
          ]}
        />
      </div>
      {mode === "magnet" ? (
        <div className="modal-body">
          <label className="fld-lbl" htmlFor="magnet-input">Dán magnet link</label>
          <textarea
            id="magnet-input"
            className="field field-area mono"
            placeholder="magnet:?xt=urn:btih:..."
            value={magnet}
            onChange={(e) => setMagnet(e.target.value)}
            autoFocus
            disabled={submitting}
          />
          <div className="hint">Hỗ trợ BitTorrent v1 & v2 · DHT · PeX</div>
        </div>
      ) : (
        <div className="modal-body">
          <label
            className={"dropzone" + (drag ? " over" : "") + (fileName ? " has" : "")}
            onDragOver={(e) => { e.preventDefault(); if (!submitting) setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (!submitting) handleFile(e.dataTransfer.files[0]); }}
          >
            <input type="file" accept=".torrent" hidden disabled={submitting} onChange={(e) => handleFile(e.target.files[0])} />
            <Icon name={fileName ? "check" : "upload"} size={26} />
            <div className="dz-main">{fileName || "Kéo thả tệp .torrent vào đây"}</div>
            <div className="dz-sub">{fileName ? "Sẵn sàng thêm" : "hoặc bấm để chọn tệp"}</div>
          </label>
        </div>
      )}
      <div className="modal-opts">
        <Switch checked={startNow} disabled={submitting} onChange={setStartNow}>Bắt đầu tải ngay</Switch>
        <Switch checked={skipHash} disabled={submitting} onChange={setSkipHash}>Bỏ qua kiểm tra hash</Switch>
      </div>
      <footer className="modal-foot">
        <button className="btn ghost" onClick={handleClose} disabled={submitting}>Hủy</button>
        <button className="btn primary" disabled={!valid || submitting} aria-busy={submitting || undefined} onClick={submit}>
          {submitting ? <i className="spin" aria-hidden="true" /> : <Icon name="plus" size={16} />}
          {submitting ? "Đang thêm…" : "Thêm torrent"}
        </button>
      </footer>
    </Dialog>
  );
}

function SettingsModal({ open, onClose, onSaved }) {
  // Remount body mỗi lần mở → state sạch, không cần reset trong effect.
  if (!open) return null;
  return <SettingsModalBody onClose={onClose} onSaved={onSaved} />;
}

function SettingsModalBody({ onClose, onSaved }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    GetSettings().then(s => {
      if (cancelled) return;
      setSettings({ ...DEFAULT_SETTINGS, ...(s || {}) });
      setLoadError("");
      setReady(true);
    }).catch(e => {
      if (cancelled) return;
      setSettings({ ...DEFAULT_SETTINGS });
      setLoadError(String(e));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  function save() {
    SaveSettings(settings).then(e => {
      if (e) {
        toast(e);
      } else {
        onSaved?.(settings);
        onClose();
      }
    }).catch(e => toast("Lỗi: " + e));
  }

  function chooseDir() {
    ChooseDownloadDir().then(path => {
      if (path) setSettings(s => ({ ...s, downloadDir: path }));
    }).catch(() => {});
  }

  function openDir() {
    OpenDownloadDir()
      .then(err => { if (err) toast(err); })
      .catch(e => toast("Không mở được thư mục: " + e));
  }

  const loading = !ready;
  const set = (patch) => setSettings(s => ({ ...s, ...patch }));

  return (
    <Dialog className="dlg-lg" labelledBy="settings-title" onClose={onClose}>
      <header className="modal-head">
        <h3 id="settings-title">Cài đặt</h3>
        <button className="ibtn" onClick={onClose} aria-label="Đóng"><Icon name="close" size={18} /></button>
      </header>
      {loading ? (
        <div className="modal-body settings-loading" aria-busy="true">
          <div className="sk" style={{ height: 40 }} />
          <div className="sk" style={{ height: 40, width: "70%" }} />
          <div className="sk" style={{ height: 120 }} />
        </div>
      ) : (
        <div className="modal-body settings-body">
          {loadError && <div className="hint hint-warn">Không tải được cài đặt: {loadError}</div>}

          <section className="settings-section first">
            <h4 className="settings-h">Lưu trữ</h4>
            <label className="fld-lbl" htmlFor="set-dir">Thư mục lưu</label>
            <div className="field-row">
              <input id="set-dir" className="field" value={settings.downloadDir || ""} onChange={e => set({ downloadDir: e.target.value })} placeholder="~/Downloads/leakdownload" />
              <button className="btn ghost" onClick={chooseDir} title="Chọn thư mục"><Icon name="folder" size={15} /> Chọn</button>
              <button className="btn ghost" onClick={openDir} title="Mở thư mục"><Icon name="folder" size={15} /> Mở</button>
            </div>
          </section>

          <section className="settings-section">
            <h4 className="settings-h">Tốc độ</h4>
            <div className="field-grid">
              <div>
                <label className="fld-lbl" htmlFor="set-down">Giới hạn tải xuống (KB/s)</label>
                <input id="set-down" className="field" type="number" min={0} value={settings.downKBps ?? 0} onChange={e => set({ downKBps: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div>
                <label className="fld-lbl" htmlFor="set-up">Giới hạn tải lên (KB/s)</label>
                <input id="set-up" className="field" type="number" min={0} value={settings.upKBps ?? 0} onChange={e => set({ upKBps: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
            </div>
            <div className="hint">0 = không giới hạn.</div>
          </section>

          <section className="settings-section">
            <h4 className="settings-h">Hàng đợi tải</h4>
            <label className="fld-lbl" htmlFor="set-active">Số torrent tải song song</label>
            <input
              id="set-active"
              className="field field-short"
              type="number"
              min={0}
              max={50}
              value={settings.maxActiveDownloads ?? 0}
              onChange={e => set({ maxActiveDownloads: Math.min(50, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
            />
            <div className="hint">
              0 = không giới hạn. Ví dụ đặt 3: chỉ 3 torrent tải cùng lúc, còn lại ở trạng thái Hàng đợi. Khi một cái xong hoặc tạm dừng, slot tự nhường tiếp.
            </div>
            <Switch checked={settings.notifyOnComplete !== false} onChange={v => set({ notifyOnComplete: v })}>
              Thông báo Windows khi tải xong
            </Switch>
          </section>

          <section className="settings-section">
            <h4 className="settings-h">Seed / chia sẻ</h4>
            <Switch
              checked={settings.blockSeed !== false}
              onChange={v => set({ blockSeed: v })}
              hint="Mặc định bật — chỉ tải về, không upload. Tắt để mở seed / chia sẻ cho peer khác."
            >
              Chặn seed (không chia sẻ lên mạng)
            </Switch>
          </section>

          <section className="settings-section">
            <h4 className="settings-h">Nguồn tìm kiếm</h4>
            <div className="settings-checks">
              <Switch checked={settings.enableApibay !== false} onChange={v => set({ enableApibay: v })}>
                Nguồn công khai (APIBay)
              </Switch>
              <Switch checked={settings.enableTorrentsCSV !== false} onChange={v => set({ enableTorrentsCSV: v })}>
                Torrents-CSV
              </Switch>
            </div>
            <label className="fld-lbl" htmlFor="set-jk">Jackett / Prowlarr URL</label>
            <input id="set-jk" className="field" value={settings.jackettURL || ""} onChange={e => set({ jackettURL: e.target.value })} placeholder="http://127.0.0.1:9117" />
            <label className="fld-lbl" htmlFor="set-key">API key</label>
            <input id="set-key" className="field" type="password" autoComplete="off" value={settings.jackettAPIKey || ""} onChange={e => set({ jackettAPIKey: e.target.value })} placeholder="API key từ Jackett / Prowlarr" />
            <div className="hint">Prowlarr: dán base URL + API key (Torznab / Jackett-compatible). Để trống nếu chỉ dùng nguồn công khai.</div>
          </section>
        </div>
      )}
      <footer className="modal-foot">
        <button className="btn ghost" onClick={onClose}>Hủy</button>
        <button className="btn primary" onClick={save} disabled={loading}><Icon name="check" size={16} /> Lưu</button>
      </footer>
    </Dialog>
  );
}

function StatusBar({ totalDown, totalUp, active, connections, dht, downLimit, upLimit, queued, maxActive, blockSeed }) {
  const fmtLimit = (v) => v ? fmtSpeed(v) : "∞";
  const animDown = useAnimatedNumber(totalDown || 0, 400);
  const animUp = useAnimatedNumber(totalUp || 0, 400);
  const ds = totalDown ? fmtSpeed(Math.round(animDown)) : "0 KB/s";
  const us = totalUp ? fmtSpeed(Math.round(animUp)) : "0 KB/s";
  const queueHint = maxActive > 0
    ? `Queue max ${maxActive}${queued ? ` · ${queued} chờ` : ""}`
    : (queued ? `${queued} chờ` : null);
  return (
    <footer className="statusbar">
      <span className="sb-item"><span className="sb-dot live" /> {active} đang hoạt động</span>
      <span className="sb-item dl"><Icon name="download" size={14} /> <b className="mono">{ds}</b></span>
      <span className="sb-item ul"><Icon name="upload" size={14} /> <b className="mono">{us}</b></span>
      <span className="sb-spacer" />
      {blockSeed && (
        <span className="sb-badge" title="Đang chặn seed — mở lại trong Cài đặt">No-seed</span>
      )}
      {queueHint && (
        <span className="sb-item" title="Giới hạn tải song song (Cài đặt)"><Icon name="list" size={14} /> <span className="mono">{queueHint}</span></span>
      )}
      <span className="sb-item"><Icon name="peers" size={14} /> <span className="mono">{connections}</span> kết nối</span>
      <span className="sb-item"><Icon name="globe" size={14} /> DHT: <span className="mono">{dht}</span></span>
      <span className="sb-item"><Icon name="bolt" size={14} /> Giới hạn: <span className="mono">↓{fmtLimit(downLimit)} ↑{fmtLimit(upLimit)}</span></span>
    </footer>
  );
}

export { DetailPanel, AddModal, StatusBar, SettingsModal };
