import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TorrentTable, NavItems, Brand } from './components/components.jsx';
import { DetailPanel, AddModal, StatusBar, SettingsModal } from './components/detail.jsx';
import { Icon } from './components/icons.jsx';
import { fmtSpeed, fmtBytes } from './utils.js';
import { useAnimatedNumber } from './useAnimatedNumber.js';

import { GetSnapshot, AddMagnet, AddTorrentFile, AddTorrentBase64, PauseTorrent, ResumeTorrent, RemoveTorrent, PauseAll, ResumeAll, GetSettings, SaveSettings, ChooseDownloadDir } from './wailsjs/go/main/App.js';
import { EventsOn, WindowSetDarkTheme, WindowSetLightTheme } from './wailsjs/runtime/runtime.js';

const MAX_HISTORY = 120;

const CAT = ["video", "audio", "software", "docs", "game"];

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, color: "var(--muted)" }}>
          <Icon name="alert" size={40} />
          <p style={{ fontSize: 15, fontWeight: 600 }}>Đã xảy ra lỗi</p>
          <pre style={{ fontSize: 12, maxWidth: 600, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{this.state.err.message}</pre>
          <button className="btn primary" onClick={() => this.setState({ err: null })}>Thử lại</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [torrents, setTorrents] = useState([]);
  const [stats, setStats] = useState({});
  const [selId, setSelId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("torrnet-theme") === "dark"; } catch { return false; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const histRef = useRef({});
  const seenRef = useRef(new Set());
  const [entering, setEntering] = useState(new Set());
  const [exiting, setExiting] = useState(new Set());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("torrnet-theme", dark ? "dark" : "light"); } catch {}
    if (dark) WindowSetDarkTheme(); else WindowSetLightTheme();
  }, [dark]);

  useEffect(() => {
    GetSnapshot().then(s => {
      if (s?.stats) setStats(s.stats);
      if (s?.torrents) applyTorrents(s.torrents.map(tr => mapTorrent(tr)));
    }).catch(() => {});
    const unsub = EventsOn("torrents:update", s => {
      if (!s) return;
      if (s.stats) setStats(s.stats);
      applyTorrents((s.torrents || []).map(tr => mapTorrent(tr)));
    });
    return () => { if (unsub) unsub(); };
  }, []);

  function applyTorrents(next) {
    trackHistory(histRef, next);
    const hashes = new Set(next.map(t => t.hash));
    const newHashes = new Set();
    for (const t of next) {
      if (!seenRef.current.has(t.hash)) { seenRef.current.add(t.hash); newHashes.add(t.hash); }
    }
    for (const h of seenRef.current) { if (!hashes.has(h)) seenRef.current.delete(h); }
    setTorrents(next.map(t => ({ ...t, _enter: newHashes.has(t.hash) })));
    if (newHashes.size > 0) {
      setEntering(prev => { const n = new Set(prev); newHashes.forEach(h => n.add(h)); return n; });
      setTimeout(() => setEntering(prev => {
        const n = new Set(prev);
        newHashes.forEach(h => n.delete(h));
        return n;
      }), 400);
    }
  }

  function mapTorrent(tr) {
    return { ...tr, id: tr.infoHash, hash: tr.infoHash, size: tr.totalBytes, progress: tr.progress / 100, down: tr.downSpeed, up: tr.upSpeed, category: CAT[tr.infoHash.charCodeAt(0) % CAT.length], _type: "torrent" };
  }

  function trackHistory(ref, items) {
    const now = Date.now();
    for (const t of items) {
      if (!t.hash) continue;
      if (!ref.current[t.hash]) ref.current[t.hash] = [];
      ref.current[t.hash].push({ t: now, d: t.down, u: t.up });
      if (ref.current[t.hash].length > MAX_HISTORY) ref.current[t.hash].shift();
    }
  }

  function unifiedAction(item, kind) {
    if (kind === "remove") {
      if (selId === item.hash) setSelId(null);
      setExiting(prev => { const n = new Set(prev); n.add(item.hash); return n; });
      setTimeout(() => {
        RemoveTorrent(item.hash).catch(() => {});
        setExiting(prev => { const n = new Set(prev); n.delete(item.hash); return n; });
      }, 280);
    } else if (kind === "pause") PauseTorrent(item.hash).catch(() => {});
    else if (kind === "resume") ResumeTorrent(item.hash).catch(() => {});
  }

  const pauseAll = useCallback(() => { PauseAll().catch(() => {}); }, []);
  const resumeAll = useCallback(() => { ResumeAll().catch(() => {}); }, []);

  function addTorrent({ mode, magnet, fileData }) {
    if (mode === "magnet") {
      AddMagnet(magnet || "").then(e => e && alert(e)).catch(e => alert("Lỗi: " + e));
    } else {
      if (fileData) {
        AddTorrentBase64(fileData).then(e => e && alert(e)).catch(e => alert("Lỗi: " + e));
      } else {
        AddTorrentFile().then(e => e && alert(e)).catch(e => alert("Lỗi: " + e));
      }
    }
  }

  const allItems = torrents;

  const visible = useMemo(() => allItems.filter(item => {
    if (filter === "downloading" && item.status !== "downloading") return false;
    if (filter === "seeding" && item.status !== "seeding") return false;
    if (filter === "completed" && !(item.status === "completed" || item.status === "seeding")) return false;
    if (filter === "paused" && item.status !== "paused") return false;
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [allItems, filter, query]);

  const counts = useMemo(() => ({
    all: allItems.length, downloading: allItems.filter(x => x.status === "downloading").length,
    seeding: allItems.filter(x => x.status === "seeding").length,
    completed: allItems.filter(x => x.status === "completed" || x.status === "seeding").length,
    paused: allItems.filter(x => x.status === "paused").length,
  }), [allItems]);

  const totalDown = allItems.reduce((s, x) => s + (x.down || 0), 0);
  const totalUp = allItems.reduce((s, x) => s + (x.up || 0), 0);
  const activeN = allItems.filter(x => x.status === "downloading" || x.status === "seeding").length;
  const connections = allItems.reduce((s, x) => s + (x.peers || 0), 0);
  const selected = allItems.find(x => x.hash === selId) || null;
  const selHist = (selId && histRef.current[selId]) || [];

  function handleSelect(item) { setSelId(item.hash); }

  return (
    <ErrorBoundary>
    <div className="app lay-side">
      <aside className="sidebar">
        <Brand />
        <NavItems active={filter} onNav={setFilter} counts={counts} vertical={true} />
        <div className="side-foot">
          <div style={{ marginBottom: 8, display: "flex", gap: 6 }}>
            <button className="ibtn" title={dark ? "Chế độ sáng" : "Chế độ tối"} onClick={() => setDark(d => !d)}>
              <Icon name={dark ? "sun" : "moon"} size={16} />
            </button>
            <button className="ibtn" title="Cài đặt" onClick={() => setSettingsOpen(true)}>
              <Icon name="cog" size={16} />
            </button>
          </div>
          <div className="mini-speed"><span className="dl"><Icon name="download" size={13} /> {fmtSpeed(totalDown)}</span><span className="ul"><Icon name="upload" size={13} /> {fmtSpeed(totalUp)}</span></div>
        </div>
      </aside>

      <div className="main">
        <div className="toolbar" style={{ flexWrap: "wrap", gap: "6px 10px" }}>
          <button className="btn primary" onClick={() => setAddOpen(true)}><Icon name="plus" size={16} /> Thêm torrent</button>
          <div className="tb-group">
            <button className="btn ghost" onClick={resumeAll}><Icon name="play" size={15} /> Tất cả</button>
            <button className="btn ghost" onClick={pauseAll}><Icon name="pause" size={15} /> Tất cả</button>
          </div>
          <div className="search"><Icon name="search" size={16} /><input placeholder="Tìm..." value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="ibtn sm" onClick={() => setQuery("")}><Icon name="close" size={13} /></button>}</div>
        </div>

        <div className="content" style={{ position: "relative" }}>
          <div className="list-wrap">
            {visible.length ? <TorrentTable torrents={visible} selectedId={selId} onSelect={handleSelect} onAction={unifiedAction} density="comfortable" progressStyle="bar" exiting={exiting} />
            : <div className="empty"><Icon name="search" size={28} /><p>Không có mục nào. Thêm torrent để bắt đầu.</p></div>}
          </div>
          {selected && <DetailPanel torrent={selected} history={selHist} accent="var(--accent)" onClose={() => setSelId(null)} onFileToggle={(hash, index, prio) => { window.go.main.App.SetFilePriority(hash, index, prio); }} />}
        </div>

        <StatusBar totalDown={totalDown} totalUp={totalUp} active={activeN} connections={connections} dht={stats.dhtNodes || "—"} downLimit={stats.downLimit} upLimit={stats.upLimit} />
      </div>

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addTorrent} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
    </ErrorBoundary>
  );
}

export default App;
