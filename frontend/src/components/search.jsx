import { useState, useMemo, useCallback } from 'react';
import { Icon } from './icons.jsx';
import { fmtBytes } from '../utils.js';
import { SearchTorrents, AddMagnet } from '../wailsjs/go/main/App.js';
import { useColumnWidths } from '../useColumnWidths.js';

const SEARCH_COL_DEFAULTS = {
  name: 360,
  size: 100,
  seeders: 72,
  leechers: 72,
  source: 110,
  actions: 96,
};

const HISTORY_KEY = 'leakdownload-search-history';
const MAX_SEARCH_HISTORY = 24;

function loadSearchHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x.trim()).slice(0, MAX_SEARCH_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveSearchHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_SEARCH_HISTORY)));
  } catch { /* private mode */ }
}

function pushSearchHistory(query) {
  const q = query.trim();
  if (q.length < 2) return loadSearchHistory();
  const prev = loadSearchHistory().filter(x => x.toLowerCase() !== q.toLowerCase());
  const next = [q, ...prev].slice(0, MAX_SEARCH_HISTORY);
  saveSearchHistory(next);
  return next;
}

function SearchTh({ colKey, children, align, sortable, sortKey, asc, widths, onSort, onResize }) {
  return (
    <th
      className={(sortable ? 'sortable ' : '') + (colKey !== 'actions' ? 'resizable' : '')}
      style={{ textAlign: align || 'left', width: widths[colKey] + 'px' }}
      onClick={sortable ? () => onSort(colKey) : undefined}
    >
      <span className="th-label">
        {children}
        {sortable && sortKey === colKey && <span className="sort-caret">{asc ? '▲' : '▼'}</span>}
      </span>
      {colKey !== 'actions' && (
        <span
          className="col-resizer"
          title="Kéo để đổi độ rộng cột"
          onMouseDown={(e) => onResize(colKey, e)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </th>
  );
}

const SOURCE_LABEL = {
  apibay: 'APIBay',
  'torrents-csv': 'CSV',
  jackett: 'Jackett',
};

function sourceLabel(src) {
  if (!src) return '—';
  if (SOURCE_LABEL[src]) return SOURCE_LABEL[src];
  if (src.startsWith('jackett:')) return src.slice(8) || 'Jackett';
  return src;
}

function sourceClass(src) {
  if (!src) return '';
  if (src.startsWith('jackett')) return 'src-jackett';
  if (src === 'torrents-csv') return 'src-csv';
  if (src === 'apibay') return 'src-apibay';
  return '';
}

function SearchPanel({ onAdded, knownHashes }) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [queried, setQueried] = useState([]);
  const [searched, setSearched] = useState(false);
  const [adding, setAdding] = useState(new Set());
  const [added, setAdded] = useState(new Set());
  const [sortKey, setSortKey] = useState('seeders');
  const [asc, setAsc] = useState(false);
  const [history, setHistory] = useState(() => loadSearchHistory());
  const { widths, startResize, tableRef } = useColumnWidths(
    'leakdownload-cols-search',
    SEARCH_COL_DEFAULTS,
    56,
    { flexKeys: ['name'] },
  );

  const known = knownHashes instanceof Set ? knownHashes : new Set();

  const totalWidth = useMemo(
    () => Object.values(widths).reduce((s, w) => s + (Number(w) || 0), 0),
    [widths],
  );

  const sorted = useMemo(() => {
    const list = [...results];
    list.sort((a, b) => {
      let r = 0;
      if (sortKey === 'name') r = (a.name || '').localeCompare(b.name || '');
      else if (sortKey === 'size') r = (a.size || 0) - (b.size || 0);
      else if (sortKey === 'seeders') r = (a.seeders || 0) - (b.seeders || 0);
      else if (sortKey === 'leechers') r = (a.leechers || 0) - (b.leechers || 0);
      else if (sortKey === 'source') r = (a.source || '').localeCompare(b.source || '');
      return asc ? r : -r;
    });
    return list;
  }, [results, sortKey, asc]);

  function toggleSort(k) {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(k === 'name' || k === 'source');
    }
  }

  const runSearch = useCallback(async (e, overrideQuery) => {
    e?.preventDefault?.();
    const query = (overrideQuery != null ? overrideQuery : q).trim();
    if (query.length < 2) {
      alert('Nhập ít nhất 2 ký tự để tìm.');
      return;
    }
    if (overrideQuery != null) setQ(query);
    setLoading(true);
    setSearched(true);
    setErrors([]);
    setHistory(pushSearchHistory(query));
    try {
      const res = await SearchTorrents(query);
      setResults(res?.results || []);
      setErrors(res?.errors || []);
      setQueried(res?.queried || []);
      setAdded(new Set());
    } catch (err) {
      setResults([]);
      setErrors([String(err)]);
      setQueried([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  function clearHistory() {
    saveSearchHistory([]);
    setHistory([]);
  }

  function removeHistoryItem(term) {
    const next = loadSearchHistory().filter(x => x !== term);
    saveSearchHistory(next);
    setHistory(next);
  }

  async function addOne(row) {
    const key = row.infoHash || row.magnet;
    const hash = (row.infoHash || '').toLowerCase();
    if (!row.magnet || adding.has(key) || added.has(key) || (hash && known.has(hash))) return;
    setAdding(prev => new Set(prev).add(key));
    try {
      const err = await AddMagnet(row.magnet, true, false);
      if (err) {
        alert(err);
      } else {
        setAdded(prev => new Set(prev).add(key));
        onAdded?.();
      }
    } catch (e) {
      alert('Lỗi: ' + e);
    } finally {
      setAdding(prev => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    }
  }

  function isAlreadyInList(row) {
    const h = (row.infoHash || '').toLowerCase();
    if (h && known.has(h)) return true;
    const key = row.infoHash || row.magnet;
    return added.has(key);
  }

  return (
    <div className="search-panel">
      <form className="search-bar" onSubmit={runSearch}>
        <div className="search search-wide">
          <Icon name="search" size={16} />
          <input
            placeholder="Tìm torrent (phim, game, ISO…)"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
          {q && (
            <button type="button" className="ibtn sm" onClick={() => setQ('')}>
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        <button type="submit" className="btn primary" disabled={loading || q.trim().length < 2}>
          <Icon name="search" size={15} />
          {loading ? 'Đang tìm…' : 'Tìm kiếm'}
        </button>
      </form>

      {history.length > 0 && (
        <div className="search-history">
          <div className="search-history-head">
            <span className="search-history-label">Gần đây</span>
            <button type="button" className="btn ghost sm" onClick={clearHistory}>Xóa lịch sử</button>
          </div>
          <div className="search-history-chips">
            {history.map((term) => (
              <span key={term} className="hist-chip-wrap">
                <button
                  type="button"
                  className="hist-chip"
                  title="Tìm lại"
                  disabled={loading}
                  onClick={() => runSearch(null, term)}
                >
                  {term}
                </button>
                <button
                  type="button"
                  className="hist-chip-x"
                  title="Xóa"
                  onClick={() => removeHistoryItem(term)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {queried.length > 0 && (
        <div className="search-meta">
          Nguồn: {queried.map(s => sourceLabel(s)).join(' · ')}
          {results.length > 0 && <> · <span className="mono">{results.length}</span> kết quả</>}
        </div>
      )}

      {errors.length > 0 && (
        <div className="search-errors">
          {errors.map((err, i) => (
            <span key={i} className="err-chip" title={err}>{err}</span>
          ))}
        </div>
      )}

      {loading && (
        <div className="empty search-empty">
          <div className="spin" />
          <p>Đang tìm trên các nguồn…</p>
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="empty search-empty">
          <Icon name="search" size={28} />
          <p>Không có kết quả. Thử từ khóa khác hoặc bật thêm nguồn trong Cài đặt.</p>
        </div>
      )}

      {!loading && !searched && (
        <div className="empty search-empty">
          <Icon name="globe" size={28} />
          <p>Nhập từ khóa để tìm torrent từ nguồn công khai (và Jackett nếu đã cấu hình).</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="search-table-wrap">
          <table
            ref={tableRef}
            className="ttable comfortable search-table resizable-table"
            style={{ width: totalWidth, minWidth: '100%' }}
          >
            <colgroup>
              {Object.keys(SEARCH_COL_DEFAULTS).map((k) => (
                <col key={k} style={{ width: widths[k] + 'px' }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <SearchTh colKey="name" sortable sortKey={sortKey} asc={asc} widths={widths} onSort={toggleSort} onResize={startResize}>Tên</SearchTh>
                <SearchTh colKey="size" align="right" sortable sortKey={sortKey} asc={asc} widths={widths} onSort={toggleSort} onResize={startResize}>Size</SearchTh>
                <SearchTh colKey="seeders" align="right" sortable sortKey={sortKey} asc={asc} widths={widths} onSort={toggleSort} onResize={startResize}>Seeds</SearchTh>
                <SearchTh colKey="leechers" align="right" sortable sortKey={sortKey} asc={asc} widths={widths} onSort={toggleSort} onResize={startResize}>Leech</SearchTh>
                <SearchTh colKey="source" sortable sortKey={sortKey} asc={asc} widths={widths} onSort={toggleSort} onResize={startResize}>Nguồn</SearchTh>
                <SearchTh colKey="actions" widths={widths} onSort={toggleSort} onResize={startResize}></SearchTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const key = row.infoHash || row.magnet;
                const isAdding = adding.has(key);
                const already = isAlreadyInList(row);
                return (
                  <tr
                    key={key}
                    className={already ? 'row-already' : undefined}
                    onDoubleClick={() => !already && addOne(row)}
                    title={already ? 'Đã có trong danh sách' : 'Double-click để thêm'}
                  >
                    <td className="cell-name">
                      <span className="name-text" title={row.name}>{row.name}</span>
                      {already && <span className="already-badge">Đã thêm</span>}
                    </td>
                    <td className="mono num" title={row.size ? row.size + ' B' : undefined}>{row.size ? fmtBytes(row.size) : '—'}</td>
                    <td className="mono num" style={{ color: row.seeders > 0 ? 'var(--up)' : 'var(--muted)' }}>
                      {row.seeders ?? '—'}
                    </td>
                    <td className="mono num">{row.leechers ?? '—'}</td>
                    <td>
                      <span className={'src-badge ' + sourceClass(row.source)} title={row.source}>{sourceLabel(row.source)}</span>
                    </td>
                    <td className="cell-act" onClick={e => e.stopPropagation()}>
                      <button
                        className={'btn sm ' + (already ? 'ghost' : 'primary')}
                        disabled={isAdding || already}
                        onClick={() => addOne(row)}
                        title={already ? 'Đã có trong danh sách' : 'Thêm torrent'}
                      >
                        <Icon name={already ? 'check' : 'plus'} size={14} />
                        {already ? 'Có rồi' : isAdding ? '…' : 'Thêm'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export { SearchPanel };
