import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TorrentTable, NavItems, Brand } from './components/components.jsx';
import { DetailPanel, AddModal, StatusBar, SettingsModal } from './components/detail.jsx';
import { SearchPanel } from './components/search.jsx';
import { Icon } from './components/icons.jsx';
import { fmtSpeed } from './utils.js';

import {
  GetSnapshot, GetSettings, AddMagnet, AddTorrentFile, AddTorrentBase64,
  PauseTorrent, ResumeTorrent, RemoveTorrent, PauseAll, ResumeAll,
  SetFilePriority,
} from './wailsjs/go/main/App.js';
import { EventsOn, WindowSetDarkTheme, WindowSetLightTheme } from './wailsjs/runtime/runtime.js';

const MAX_HISTORY = 120;
const DONE_STATUSES = new Set(["completed", "seeding"]);

/** Gọi notification runtime nếu Wails hỗ trợ (CLI mới); bỏ qua im lặng nếu không. */
async function notifyRuntime(fn, ...args) {
  try {
    const rt = typeof window !== "undefined" ? window.runtime : null;
    if (!rt || typeof rt[fn] !== "function") return undefined;
    return await rt[fn](...args);
  } catch {
    return undefined;
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null, key: 0 }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, color: "var(--muted)" }}>
          <Icon name="alert" size={40} />
          <p style={{ fontSize: 15, fontWeight: 600 }}>Đã xảy ra lỗi</p>
          <pre style={{ fontSize: 12, maxWidth: 600, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{this.state.err.message}</pre>
          <button className="btn primary" onClick={() => this.setState(s => ({ err: null, key: s.key + 1 }))}>Thử lại</button>
        </div>
      );
    }
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}

/** Gợi ý icon theo tên torrent (không phải metadata thật). */
function guessCategory(name) {
  const n = (name || "").toLowerCase();
  if (/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|m2ts|vob)(\b|$)/i.test(n) ||
      /\b(s\d{2}e\d{2}|1080p|720p|2160p|4k|bluray|web-?dl|x264|x265|hevc)\b/i.test(n)) {
    return "video";
  }
  if (/\.(mp3|flac|aac|wav|ogg|m4a|wma|opus)(\b|$)/i.test(n) || /\b(discography|album|flac)\b/i.test(n)) {
    return "audio";
  }
  if (/\.(pdf|epub|mobi|azw3|txt|doc|docx)(\b|$)/i.test(n)) return "docs";
  if (/\b(game|gog|steam|fitgirl|repack|rpg|xbox|ps[45])\b/i.test(n)) return "game";
  if (/\.(exe|msi|dmg|pkg|deb|rpm|appimage|apk|zip|rar|7z|tar|gz|iso)(\b|$)/i.test(n) ||
      /\b(windows|linux|macos|android|setup|installer)\b/i.test(n)) {
    return "software";
  }
  return "file";
}

function mapTorrent(tr) {
  const hash = tr.infoHash || "";
  const name = tr.name || "";
  const total = Number(tr.totalBytes) || 0;
  const progressPct = Math.min(100, Math.max(0, Number(tr.progress) || 0));
  return {
    ...tr,
    id: hash,
    hash,
    name,
    size: total,
    progress: progressPct / 100,
    down: Number(tr.downSpeed) || 0,
    up: Number(tr.upSpeed) || 0,
    peers: Number(tr.peers) || 0,
    seeds: Number(tr.seeds) || 0,
    ratio: Number(tr.ratio) || 0,
    category: guessCategory(name),
    _type: "torrent",
  };
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
  const [history, setHistory] = useState({});
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const seenRef = useRef(new Set());
  const statusRef = useRef(new Map()); // hash -> last status (phát hiện vừa hoàn tất)
  const [exiting, setExiting] = useState(new Set());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("torrnet-theme", dark ? "dark" : "light"); } catch { /* private mode */ }
    if (dark) WindowSetDarkTheme(); else WindowSetLightTheme();
  }, [dark]);

  // Nạp preference thông báo + khởi tạo Windows notification (nếu runtime có).
  useEffect(() => {
    GetSettings().then(s => {
      if (s && typeof s.notifyOnComplete === "boolean") {
        setNotifyOnComplete(s.notifyOnComplete);
      }
    }).catch(() => {});

    let cancelled = false;
    (async () => {
      const available = await notifyRuntime("IsNotificationAvailable");
      if (cancelled || available === false) return;
      await notifyRuntime("InitializeNotifications");
      await notifyRuntime("RequestNotificationAuthorization");
    })();
    return () => { cancelled = true; };
  }, []);

  const notifyComplete = useCallback(async (name, hash) => {
    if (!notifyOnComplete) return;
    const title = "Tải xong";
    const body = name || hash || "Torrent đã hoàn tất";

    // 1) Wails runtime notification (nếu CLI hỗ trợ)
    const available = await notifyRuntime("IsNotificationAvailable");
    if (available !== false) {
      const sent = await notifyRuntime("SendNotification", {
        id: `done-${hash}-${Date.now()}`,
        title,
        body,
      });
      if (sent !== undefined) return;
    }

    // 2) Web Notification API (WebView2 / browser)
    try {
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") new Notification(title, { body });
      }
    } catch { /* ignore */ }
  }, [notifyOnComplete]);

  useEffect(() => {
    function applyTorrents(next) {
      const hashes = new Set(next.map(t => t.hash));
      const newHashes = new Set();
      for (const t of next) {
        if (!seenRef.current.has(t.hash)) {
          seenRef.current.add(t.hash);
          newHashes.add(t.hash);
        }
      }
      for (const h of [...seenRef.current]) {
        if (!hashes.has(h)) {
          seenRef.current.delete(h);
          statusRef.current.delete(h);
        }
      }

      // Toast khi chuyển sang completed/seeding từ trạng thái đang tải.
      for (const t of next) {
        if (!t.hash) continue;
        const prev = statusRef.current.get(t.hash);
        const now = t.status;
        if (
          prev &&
          !DONE_STATUSES.has(prev) &&
          DONE_STATUSES.has(now) &&
          (prev === "downloading" || prev === "metadata" || prev === "queued")
        ) {
          notifyComplete(t.name, t.hash);
        }
        statusRef.current.set(t.hash, now);
      }

      const ts = Date.now();
      setHistory(prev => {
        const nextHist = { ...prev };
        for (const t of next) {
          if (!t.hash) continue;
          const arr = [...(nextHist[t.hash] || []), { t: ts, d: t.down, u: t.up }];
          if (arr.length > MAX_HISTORY) arr.splice(0, arr.length - MAX_HISTORY);
          nextHist[t.hash] = arr;
        }
        for (const h of Object.keys(nextHist)) {
          if (!hashes.has(h)) delete nextHist[h];
        }
        return nextHist;
      });

      setTorrents(next.map(t => ({ ...t, _enter: newHashes.has(t.hash) })));
    }

    GetSnapshot().then(s => {
      if (s?.stats) setStats(s.stats);
      if (s?.torrents) applyTorrents(s.torrents.map(mapTorrent));
    }).catch(() => { /* backend chưa sẵn sàng */ });

    const unsub = EventsOn("torrents:update", s => {
      if (!s) return;
      if (s.stats) setStats(s.stats);
      applyTorrents((s.torrents || []).map(mapTorrent));
    });
    return () => { if (unsub) unsub(); };
  }, [notifyComplete]);

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

  function addTorrent({ mode, magnet, fileData, startNow = true, skipHash = false }) {
    if (mode === "magnet") {
      AddMagnet(magnet || "", startNow, skipHash).then(e => e && alert(e)).catch(e => alert("Lỗi: " + e));
    } else if (fileData) {
      AddTorrentBase64(fileData, startNow, skipHash).then(e => e && alert(e)).catch(e => alert("Lỗi: " + e));
    } else {
      AddTorrentFile(startNow, skipHash).then(e => e && alert(e)).catch(e => alert("Lỗi: " + e));
    }
  }

  const handleFileToggle = useCallback((hash, index, prio) => {
    SetFilePriority(hash, index, prio).catch(e => console.error(e));
  }, []);

  const allItems = torrents;

  const isSearch = filter === "search";

  const visible = useMemo(() => {
    if (isSearch) return [];
    return allItems.filter(item => {
      if (filter === "downloading" && item.status !== "downloading" && item.status !== "metadata") return false;
      if (filter === "queued" && item.status !== "queued") return false;
      if (filter === "seeding" && item.status !== "seeding") return false;
      if (filter === "completed" && !(item.status === "completed" || item.status === "seeding")) return false;
      if (filter === "paused" && item.status !== "paused") return false;
      if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [allItems, filter, query, isSearch]);

  const counts = useMemo(() => ({
    all: allItems.length,
    downloading: allItems.filter(x => x.status === "downloading" || x.status === "metadata").length,
    queued: allItems.filter(x => x.status === "queued").length,
    seeding: allItems.filter(x => x.status === "seeding").length,
    completed: allItems.filter(x => x.status === "completed" || x.status === "seeding").length,
    paused: allItems.filter(x => x.status === "paused").length,
  }), [allItems]);

  const knownHashes = useMemo(
    () => new Set(allItems.map(t => (t.hash || "").toLowerCase()).filter(Boolean)),
    [allItems],
  );

  // Ưu tiên số liệu tổng từ backend (đồng bộ DHT / connections / active).
  const totalDown = Number(stats.downSpeed) || allItems.reduce((s, x) => s + (x.down || 0), 0);
  const totalUp = Number(stats.upSpeed) || allItems.reduce((s, x) => s + (x.up || 0), 0);
  const activeN = Number.isFinite(stats.active)
    ? stats.active
    : allItems.filter(x => x.status === "downloading" || x.status === "metadata" || x.status === "seeding").length;
  const connections = Number.isFinite(stats.connections)
    ? stats.connections
    : allItems.reduce((s, x) => s + (x.peers || 0), 0);
  const selected = allItems.find(x => x.hash === selId) || null;
  const selHist = (selId && history[selId]) || [];

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
        {!isSearch && (
          <div className="toolbar" style={{ flexWrap: "wrap", gap: "6px 10px" }}>
            <button className="btn primary" onClick={() => setAddOpen(true)}><Icon name="plus" size={16} /> Thêm torrent</button>
            <div className="tb-group">
              <button className="btn ghost" onClick={resumeAll}><Icon name="play" size={15} /> Tất cả</button>
              <button className="btn ghost" onClick={pauseAll}><Icon name="pause" size={15} /> Tất cả</button>
            </div>
            <div className="search"><Icon name="search" size={16} /><input placeholder="Lọc danh sách..." value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="ibtn sm" onClick={() => setQuery("")}><Icon name="close" size={13} /></button>}</div>
          </div>
        )}

        <div className="content" style={{ position: "relative" }}>
          {isSearch ? (
            <SearchPanel
              onAdded={() => setFilter("downloading")}
              knownHashes={knownHashes}
            />
          ) : (
            <>
              <div className="list-wrap">
                {visible.length ? <TorrentTable torrents={visible} selectedId={selId} onSelect={handleSelect} onAction={unifiedAction} density="comfortable" progressStyle="bar" exiting={exiting} />
                : <div className="empty"><Icon name="search" size={28} /><p>Không có mục nào. Thêm torrent hoặc mở tab Tìm kiếm.</p></div>}
              </div>
              {selected && (
                <DetailPanel
                  key={selected.hash}
                  torrent={selected}
                  history={selHist}
                  accent="var(--accent)"
                  onClose={() => setSelId(null)}
                  onFileToggle={handleFileToggle}
                />
              )}
            </>
          )}
        </div>

        <StatusBar
          totalDown={totalDown}
          totalUp={totalUp}
          active={activeN}
          connections={connections}
          dht={stats.dhtNodes ?? "—"}
          downLimit={stats.downLimit}
          upLimit={stats.upLimit}
          queued={Number(stats.queued) || counts.queued || 0}
          maxActive={Number(stats.maxActive) || 0}
          blockSeed={stats.blockSeed !== false}
        />
      </div>

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addTorrent} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => {
          if (s && typeof s.notifyOnComplete === "boolean") {
            setNotifyOnComplete(s.notifyOnComplete);
          }
        }}
      />
    </div>
    </ErrorBoundary>
  );
}

export default App;
