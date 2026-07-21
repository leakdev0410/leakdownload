package torrentengine

import (
	"bytes"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/anacrolix/dht/v2"
	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"
	"github.com/anacrolix/torrent/types"
	"golang.org/x/time/rate"
)

// Status mô tả trạng thái hiện tại của một torrent.
type Status string

const (
	StatusMetadata    Status = "metadata"    // đang lấy metadata (magnet chưa có info)
	StatusDownloading Status = "downloading" // đang tải
	StatusSeeding     Status = "seeding"     // đã xong, đang seed (có peer/đang lên)
	StatusCompleted   Status = "completed"   // đã xong, không hoạt động
	StatusPaused      Status = "paused"      // tạm dừng (user)
	StatusQueued      Status = "queued"      // chờ slot tải (queue)
)

// TorrentView là dữ liệu phẳng (JSON) cho danh sách torrent ở frontend.
type TorrentView struct {
	InfoHash   string  `json:"infoHash"`
	Name       string  `json:"name"`
	Status     Status  `json:"status"`
	Progress   float64 `json:"progress"` // 0..100
	TotalBytes int64   `json:"totalBytes"`
	DoneBytes  int64   `json:"doneBytes"`
	DownSpeed  int64   `json:"downSpeed"` // bytes/giây
	UpSpeed    int64   `json:"upSpeed"`   // bytes/giây
	UpBytes    int64   `json:"upBytes"`   // tổng đã tải lên
	Peers      int     `json:"peers"`
	Seeds      int     `json:"seeds"`
	Ratio      float64 `json:"ratio"`
	Eta        int64   `json:"eta"` // giây còn lại, -1 nếu chưa biết
	FileCount  int     `json:"fileCount"`
}

// GlobalStats là số liệu tổng cho thanh trạng thái.
type GlobalStats struct {
	DownSpeed   int64 `json:"downSpeed"`
	UpSpeed     int64 `json:"upSpeed"`
	Active      int   `json:"active"`
	Total       int   `json:"total"`
	Downloading int   `json:"downloading"`
	Seeding     int   `json:"seeding"`
	Completed   int   `json:"completed"`
	Paused      int   `json:"paused"`
	Queued      int   `json:"queued"`
	Connections int   `json:"connections"`
	DhtNodes    int   `json:"dhtNodes"`
	DownLimit   int64 `json:"downLimit"` // bytes/s, 0 = không giới hạn
	UpLimit     int64 `json:"upLimit"`
	MaxActive   int   `json:"maxActive"` // 0 = không giới hạn số torrent tải song song
	BlockSeed   bool  `json:"blockSeed"` // true = đang chặn seed/upload
}

// Snapshot gói cả danh sách torrent và số liệu tổng cho một lần cập nhật.
type Snapshot struct {
	Torrents []TorrentView `json:"torrents"`
	Stats    GlobalStats   `json:"stats"`
}

// FileView mô tả một tệp trong torrent (tab "Tệp tin").
type FileView struct {
	Index    int     `json:"index"`
	Path     string  `json:"path"`
	Bytes    int64   `json:"bytes"`
	Progress float64 `json:"progress"`
	Priority string  `json:"priority"` // "hi" | "normal" | "off"
}

// PeerView mô tả một peer (tab "Peers").
type PeerView struct {
	Addr   string `json:"addr"`
	Client string `json:"client"`
}

// TrackerView mô tả một tracker (tab "Trackers").
type TrackerView struct {
	URL  string `json:"url"`
	Tier int    `json:"tier"`
}

// Detail là dữ liệu chi tiết của torrent đang chọn (panel bên phải).
type Detail struct {
	InfoHash    string        `json:"infoHash"`
	Files       []FileView    `json:"files"`
	Peers       []PeerView    `json:"peers"`
	Trackers    []TrackerView `json:"trackers"`
	PieceLength int64         `json:"pieceLength"`
	NumPieces   int           `json:"numPieces"`
	Comment     string        `json:"comment"`
	CreatedBy   string        `json:"createdBy"`
}

type tracked struct {
	t              *torrent.Torrent
	paused         bool // user tạm dừng
	queued         bool // chờ slot (do maxActive)
	magnet         string
	meta           []byte
	dataDir        string
	filePriorities map[int]string
	lastDone       int64
	lastUp         int64
	downSpeed      int64
	upSpeed        int64
	startedOnce    bool
	addedAt        time.Time // FIFO queue
}

// Manager bọc một torrent.Client và quản lý nhiều torrent song song.
type Manager struct {
	mu        sync.Mutex
	client    *torrent.Client
	items     map[string]*tracked
	dataDir   string
	downLim   *rate.Limiter
	upLim     *rate.Limiter
	maxActive int   // 0 = không giới hạn số torrent đang tải
	boostSeq  int64 // tăng dần khi user ưu tiên torrent trong queue
	blockSeed bool  // true = không upload/seed (mặc định)
}

const limiterBurst = 1 << 18 // 256 KiB

func makeLimit(bytesPerSec int64) (rate.Limit, int) {
	if bytesPerSec <= 0 {
		return rate.Inf, limiterBurst
	}
	burst := int(bytesPerSec)
	if burst < limiterBurst {
		burst = limiterBurst
	}
	return rate.Limit(bytesPerSec), burst
}

// New khởi tạo client với thư mục lưu và giới hạn tốc độ (bytes/s, 0 = vô hạn).
func New(dataDir string, downBytesPerSec, upBytesPerSec int64) (*Manager, error) {
	dl, db := makeLimit(downBytesPerSec)
	ul, ub := makeLimit(upBytesPerSec)
	m := &Manager{
		items:     make(map[string]*tracked),
		dataDir:   dataDir,
		downLim:   rate.NewLimiter(dl, db),
		upLim:     rate.NewLimiter(ul, ub),
		blockSeed: true, // mặc định chặn seed
	}
	c, err := torrent.NewClient(m.config(dataDir))
	if err != nil {
		return nil, err
	}
	m.client = c
	return m, nil
}

func (m *Manager) config(dataDir string) *torrent.ClientConfig {
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = dataDir
	// Seed client-level: tắt khi đang chặn seed.
	cfg.Seed = !m.blockSeed
	cfg.DownloadRateLimiter = m.downLim
	cfg.UploadRateLimiter = m.upLim

	// 0 = OS chọn cổng trống. Cổng mặc định 42069 dễ "bind: address already in use"
	// khi còn instance leakdownload/client torrent khác đang chạy.
	cfg.ListenPort = 0
	// Không chặn startup nếu UPnP/NAT-PMP fail.
	cfg.NoDefaultPortForwarding = true

	// Tối ưu kết nối:
	cfg.EstablishedConnsPerTorrent = 200
	cfg.HalfOpenConnsPerTorrent = 100
	cfg.TorrentPeersHighWater = 1000
	cfg.TorrentPeersLowWater = 200
	cfg.DisableAcceptRateLimiting = true
	cfg.TotalHalfOpenConns = 500

	return cfg
}

// SetSpeedLimit đặt lại giới hạn tốc độ tải/tải lên (bytes/s, 0 = vô hạn) khi đang chạy.
func (m *Manager) SetSpeedLimit(downBytesPerSec, upBytesPerSec int64) {
	dl, db := makeLimit(downBytesPerSec)
	ul, ub := makeLimit(upBytesPerSec)
	m.downLim.SetLimit(dl)
	m.downLim.SetBurst(db)
	m.upLim.SetLimit(ul)
	m.upLim.SetBurst(ub)
}

// SetMaxActive đặt số torrent được tải song song (0 = không giới hạn) và sắp xếp lại queue.
func (m *Manager) SetMaxActive(n int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if n < 0 {
		n = 0
	}
	m.maxActive = n
	m.reconcileQueueLocked()
}

// MaxActive trả về giới hạn tải song song (0 = không giới hạn).
func (m *Manager) MaxActive() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.maxActive
}

// SetBlockSeed bật/tắt chặn upload (seed). true = không chia sẻ lên.
func (m *Manager) SetBlockSeed(block bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.blockSeed = block
	for _, tr := range m.items {
		if tr.paused {
			continue
		}
		m.applyUploadPolicyLocked(tr)
	}
}

// BlockSeed trả về true nếu đang chặn seed.
func (m *Manager) BlockSeed() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.blockSeed
}

// applyUploadPolicyLocked áp dụng chặn/cho phép upload theo blockSeed. Caller giữ m.mu.
func (m *Manager) applyUploadPolicyLocked(tr *tracked) {
	if tr.paused || m.blockSeed {
		tr.t.DisallowDataUpload()
		return
	}
	tr.t.AllowDataUpload()
}

// isComplete báo torrent đã tải đủ dữ liệu (có metadata).
func (tr *tracked) isComplete() bool {
	info := tr.t.Info()
	if info == nil {
		return false
	}
	total := tr.t.Length()
	return total > 0 && tr.t.BytesCompleted() >= total
}

// activateLocked cho phép tải (và DownloadAll lần đầu). Caller giữ m.mu.
func (m *Manager) activateLocked(tr *tracked) {
	tr.queued = false
	tr.t.AllowDataDownload()
	m.applyUploadPolicyLocked(tr)
	if tr.t.Info() != nil && !tr.startedOnce {
		tr.startedOnce = true
		tr.t.DownloadAll()
	}
}

// parkDownloadLocked giữ torrent trong queue: không tải thêm; upload theo policy seed.
func (m *Manager) parkDownloadLocked(tr *tracked) {
	tr.queued = true
	tr.t.DisallowDataDownload()
	m.applyUploadPolicyLocked(tr)
}

// reconcileQueueLocked gán slot tải theo FIFO. Caller phải giữ m.mu.
func (m *Manager) reconcileQueueLocked() {
	var waiting []*tracked
	for _, tr := range m.items {
		if tr.paused {
			tr.queued = false
			continue
		}
		if tr.isComplete() {
			tr.queued = false
			// Hoàn tất: không chiếm slot tải; seed chỉ khi không chặn.
			m.applyUploadPolicyLocked(tr)
			continue
		}
		waiting = append(waiting, tr)
	}
	sort.SliceStable(waiting, func(i, j int) bool {
		return waiting[i].addedAt.Before(waiting[j].addedAt)
	})

	limit := m.maxActive
	if limit <= 0 {
		limit = len(waiting)
	}
	for i, tr := range waiting {
		if i < limit {
			m.activateLocked(tr)
		} else {
			m.parkDownloadLocked(tr)
		}
	}
}

// Limits trả về giới hạn hiện tại (bytes/s, 0 = vô hạn).
func (m *Manager) Limits() (down, up int64) {
	if d := m.downLim.Limit(); d != rate.Inf {
		down = int64(d)
	}
	if u := m.upLim.Limit(); u != rate.Inf {
		up = int64(u)
	}
	return
}

// DataDir trả về thư mục lưu hiện tại.
func (m *Manager) DataDir() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.dataDir
}

// SetDataDir đổi thư mục mặc định cho các torrent thêm mới về sau.
func (m *Manager) SetDataDir(dir string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dataDir = dir
}

// AddMagnet thêm torrent từ magnet URI.
// startNow=false → tạm dừng; skipHash=true → bỏ qua kiểm tra piece ban đầu.
func (m *Manager) AddMagnet(uri string, startNow, skipHash bool) error {
	return m.addMagnet(uri, !startNow, m.DataDir(), nil, skipHash)
}

func (m *Manager) addMagnet(uri string, paused bool, dataDir string, filePriorities map[int]string, skipHash bool) error {
	spec, err := torrent.TorrentSpecFromMagnetUri(uri)
	if err != nil {
		return err
	}
	if dataDir != "" {
		spec.Storage = storage.NewFile(dataDir)
	}
	if paused {
		spec.DisallowDataDownload = true
		spec.DisallowDataUpload = true
	}
	if skipHash {
		spec.DisableInitialPieceCheck = true
	}
	t, _, err := m.client.AddTorrentSpec(spec)
	if err != nil {
		return err
	}
	return m.register(t, paused, uri, nil, dataDir, filePriorities)
}

// AddTorrentData thêm torrent từ nội dung file .torrent.
func (m *Manager) AddTorrentData(data []byte, startNow, skipHash bool) error {
	return m.addTorrentData(data, !startNow, m.DataDir(), nil, skipHash)
}

func (m *Manager) addTorrentData(data []byte, paused bool, dataDir string, filePriorities map[int]string, skipHash bool) error {
	mi, err := metainfo.Load(bytes.NewReader(data))
	if err != nil {
		return err
	}
	spec := torrent.TorrentSpecFromMetaInfo(mi)
	if dataDir != "" {
		spec.Storage = storage.NewFile(dataDir)
	}
	if paused {
		spec.DisallowDataDownload = true
		spec.DisallowDataUpload = true
	}
	if skipHash {
		spec.DisableInitialPieceCheck = true
	}
	t, _, err := m.client.AddTorrentSpec(spec)
	if err != nil {
		return err
	}
	return m.register(t, paused, "", data, dataDir, filePriorities)
}

// register đưa torrent vào danh sách quản lý; queue quyết định khi nào được tải.
func (m *Manager) register(t *torrent.Torrent, paused bool, magnet string, meta []byte, dataDir string, filePriorities map[int]string) error {
	h := t.InfoHash().HexString()

	m.mu.Lock()
	if _, exists := m.items[h]; exists {
		m.mu.Unlock()
		return fmt.Errorf("torrent đã tồn tại")
	}
	tr := &tracked{
		t:              t,
		paused:         paused,
		magnet:         magnet,
		meta:           meta,
		dataDir:        dataDir,
		filePriorities: filePriorities,
		addedAt:        time.Now(),
	}
	m.items[h] = tr
	if paused {
		t.DisallowDataDownload()
		t.DisallowDataUpload()
	} else {
		// Gán slot ngay (có thể vào queue nếu full).
		m.reconcileQueueLocked()
	}
	m.mu.Unlock()

	go func() {
		<-t.GotInfo()
		m.mu.Lock()
		defer m.mu.Unlock()
		cur, ok := m.items[h]
		if !ok || cur.t != t {
			return
		}
		if cur.meta == nil && cur.magnet != "" {
			if b, err := encodeMetainfo(t); err == nil {
				cur.meta = b
			}
		}
		if len(cur.filePriorities) > 0 {
			files := t.Files()
			for idx, prio := range cur.filePriorities {
				if idx >= 0 && idx < len(files) {
					switch prio {
					case "off":
						files[idx].SetPriority(types.PiecePriorityNone)
					case "hi":
						files[idx].SetPriority(types.PiecePriorityHigh)
					}
				}
			}
		}
		// Metadata xong → sắp xếp lại slot / DownloadAll nếu được active.
		if !cur.paused {
			m.reconcileQueueLocked()
		}
	}()
	return nil
}

func encodeMetainfo(t *torrent.Torrent) ([]byte, error) {
	mi := t.Metainfo()
	var buf bytes.Buffer
	if err := mi.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Pause tạm dừng tải xuống và tải lên (user pause — nhường slot cho queue).
func (m *Manager) Pause(hash string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if tr, ok := m.items[hash]; ok {
		tr.paused = true
		tr.queued = false
		tr.t.DisallowDataDownload()
		tr.t.DisallowDataUpload()
		m.reconcileQueueLocked()
	}
}

// Resume tiếp tục: đưa lên đầu hàng đợi rồi gán slot.
func (m *Manager) Resume(hash string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if tr, ok := m.items[hash]; ok {
		tr.paused = false
		// Ưu tiên torrent user vừa bấm tiếp tục / ưu tiên queue.
		m.boostSeq++
		tr.addedAt = time.Unix(0, 0).Add(-time.Duration(m.boostSeq) * time.Second)
		m.reconcileQueueLocked()
	}
}

// PauseAll tạm dừng tất cả.
func (m *Manager) PauseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, tr := range m.items {
		tr.paused = true
		tr.queued = false
		tr.t.DisallowDataDownload()
		tr.t.DisallowDataUpload()
	}
}

// ResumeAll tiếp tục tất cả (queue sẽ giới hạn số slot active).
func (m *Manager) ResumeAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	// Giữ thứ tự tương đối: cộng offset nhỏ theo hash để stable.
	i := 0
	for _, tr := range m.items {
		tr.paused = false
		tr.addedAt = now.Add(time.Duration(i) * time.Millisecond)
		i++
	}
	m.reconcileQueueLocked()
}

// Remove gỡ torrent khỏi danh sách (không xóa file đã tải trên đĩa).
func (m *Manager) Remove(hash string) {
	m.mu.Lock()
	tr, ok := m.items[hash]
	if ok {
		delete(m.items, hash)
		m.reconcileQueueLocked()
	}
	m.mu.Unlock()
	if ok {
		tr.t.Drop()
	}
}

// SetFilePriority đặt độ ưu tiên cho một tệp: "hi" | "normal" | "off".
// Giữ mutex trong suốt thao tác để tránh race với Remove/Drop.
func (m *Manager) SetFilePriority(hash string, index int, prio string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	tr, ok := m.items[hash]
	if !ok {
		return
	}
	if tr.filePriorities == nil {
		tr.filePriorities = make(map[int]string)
	}
	switch prio {
	case "hi", "off":
		tr.filePriorities[index] = prio
	default:
		prio = "normal"
		delete(tr.filePriorities, index)
	}

	t := tr.t
	if t.Info() == nil {
		return
	}
	files := t.Files()
	if index < 0 || index >= len(files) {
		return
	}
	switch prio {
	case "off":
		files[index].SetPriority(types.PiecePriorityNone)
	case "hi":
		files[index].SetPriority(types.PiecePriorityHigh)
	default:
		files[index].SetPriority(types.PiecePriorityNormal)
	}
}

// UpdateSpeeds tính tốc độ down/up dựa trên chênh lệch byte giữa 2 lần gọi.
func (m *Manager) UpdateSpeeds(interval time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	secs := interval.Seconds()
	if secs <= 0 {
		secs = 1
	}
	for _, tr := range m.items {
		stats := tr.t.Stats()
		done := tr.t.BytesCompleted()
		up := stats.BytesWrittenData.Int64()

		dDown := done - tr.lastDone
		dUp := up - tr.lastUp
		if dDown < 0 {
			dDown = 0
		}
		if dUp < 0 {
			dUp = 0
		}
		tr.downSpeed = int64(float64(dDown) / secs)
		tr.upSpeed = int64(float64(dUp) / secs)
		tr.lastDone = done
		tr.lastUp = up
	}
}

// view dựng TorrentView từ trạng thái hiện tại của torrent.
func (tr *tracked) view() TorrentView {
	t := tr.t
	v := TorrentView{
		InfoHash:  t.InfoHash().HexString(),
		DownSpeed: tr.downSpeed,
		UpSpeed:   tr.upSpeed,
		Eta:       -1,
	}

	stats := t.Stats()
	v.Peers = stats.ActivePeers
	v.Seeds = stats.ConnectedSeeders
	v.UpBytes = stats.BytesWrittenData.Int64()

	info := t.Info()
	if info == nil {
		if n := t.Name(); n != "" {
			v.Name = n
		} else {
			v.Name = "Đang lấy metadata…"
		}
		switch {
		case tr.paused:
			v.Status = StatusPaused
		case tr.queued:
			v.Status = StatusQueued
		default:
			v.Status = StatusMetadata
		}
		return v
	}

	v.Name = info.Name
	v.TotalBytes = t.Length()
	v.DoneBytes = t.BytesCompleted()
	v.FileCount = len(t.Files())
	if v.TotalBytes > 0 {
		v.Progress = float64(v.DoneBytes) / float64(v.TotalBytes) * 100
	}

	read := stats.BytesReadData.Int64()
	if read > 0 {
		v.Ratio = float64(v.UpBytes) / float64(read)
	} else if v.DoneBytes > 0 {
		v.Ratio = float64(v.UpBytes) / float64(v.DoneBytes)
	}

	done := v.TotalBytes > 0 && v.DoneBytes >= v.TotalBytes
	switch {
	case tr.paused:
		v.Status = StatusPaused
	case done && (v.Peers > 0 || v.UpSpeed > 0):
		v.Status = StatusSeeding
	case done:
		v.Status = StatusCompleted
	case tr.queued:
		v.Status = StatusQueued
	default:
		v.Status = StatusDownloading
		if v.DownSpeed > 0 {
			v.Eta = (v.TotalBytes - v.DoneBytes) / v.DownSpeed
		}
	}
	return v
}

// Snapshot trả về trạng thái hiện tại của tất cả torrent + số liệu tổng.
func (m *Manager) Snapshot() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	views := make([]TorrentView, 0, len(m.items))
	var stats GlobalStats
	// Tự promote khi có torrent vừa xong (giải phóng slot).
	m.reconcileQueueLocked()
	for _, tr := range m.items {
		v := tr.view()
		views = append(views, v)
		stats.DownSpeed += v.DownSpeed
		stats.UpSpeed += v.UpSpeed
		stats.Connections += len(tr.t.PeerConns())
		switch v.Status {
		case StatusDownloading, StatusMetadata:
			stats.Downloading++
			stats.Active++
		case StatusSeeding:
			stats.Seeding++
			stats.Active++
		case StatusCompleted:
			stats.Completed++
		case StatusPaused:
			stats.Paused++
		case StatusQueued:
			stats.Queued++
		}
	}
	stats.Total = len(views)
	stats.MaxActive = m.maxActive
	stats.BlockSeed = m.blockSeed
	if m.client != nil {
		stats.DhtNodes = m.dhtNodes()
	}
	stats.DownLimit, stats.UpLimit = m.Limits()

	sort.Slice(views, func(i, j int) bool { return views[i].InfoHash < views[j].InfoHash })
	return Snapshot{Torrents: views, Stats: stats}
}

// dhtNodes lấy số lượng node từ các server DHT bằng type assertion (rất nhanh so với reflection).
func (m *Manager) dhtNodes() int {
	n := 0
	for _, s := range m.client.DhtServers() {
		stats := s.Stats()
		if st, ok := stats.(dht.ServerStats); ok {
			n += st.GoodNodes
		} else if stPtr, ok := stats.(*dht.ServerStats); ok {
			n += stPtr.GoodNodes
		}
	}
	return n
}

// Detail trả về chi tiết torrent đang chọn (tệp, peers, trackers, thông tin).
// Giữ mutex khi đọc để không race với Remove/Drop.
func (m *Manager) Detail(hash string) Detail {
	m.mu.Lock()
	defer m.mu.Unlock()

	d := Detail{
		InfoHash: hash,
		Files:    []FileView{},
		Peers:    []PeerView{},
		Trackers: []TrackerView{},
	}
	tr, ok := m.items[hash]
	if !ok {
		return d
	}
	t := tr.t

	for _, c := range t.PeerConns() {
		pv := PeerView{Addr: c.RemoteAddr.String()}
		if name := c.PeerClientName.Load(); name != nil {
			if s, ok := name.(string); ok {
				pv.Client = s
			}
		}
		d.Peers = append(d.Peers, pv)
	}

	mi := t.Metainfo()
	if mi.Announce != "" {
		d.Trackers = append(d.Trackers, TrackerView{URL: mi.Announce, Tier: 0})
	}
	for tier, list := range mi.AnnounceList {
		for _, u := range list {
			if u == "" || u == mi.Announce {
				continue
			}
			d.Trackers = append(d.Trackers, TrackerView{URL: u, Tier: tier})
		}
	}

	info := t.Info()
	if info == nil {
		return d
	}
	d.PieceLength = info.PieceLength
	d.NumPieces = t.NumPieces()
	d.Comment = mi.Comment
	d.CreatedBy = mi.CreatedBy

	for i, f := range t.Files() {
		fv := FileView{
			Index:    i,
			Path:     cleanFilePath(f.Path(), info.Name),
			Bytes:    f.Length(),
			Priority: "normal",
		}
		if f.Length() > 0 {
			fv.Progress = float64(f.BytesCompleted()) / float64(f.Length()) * 100
		}
		switch f.Priority() {
		case types.PiecePriorityNone:
			fv.Priority = "off"
		case types.PiecePriorityHigh, types.PiecePriorityNow, types.PiecePriorityNext, types.PiecePriorityReadahead:
			fv.Priority = "hi"
		}
		d.Files = append(d.Files, fv)
	}
	return d
}

func cleanFilePath(p, root string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	p = strings.TrimPrefix(p, "./")
	root = strings.ReplaceAll(root, "\\", "/")
	if root == "" {
		return p
	}
	if len(p) > len(root) && p[len(root)] == '/' && strings.EqualFold(p[:len(root)], root) {
		return p[len(root)+1:]
	}
	return p
}

// Source là nguồn (magnet/meta) + trạng thái để lưu phiên / đổi thư mục.
type Source struct {
	Magnet         string
	Meta           []byte
	Paused         bool
	DataDir        string
	FilePriorities map[int]string
}

// Sources trả về nguồn của mọi torrent hiện có.
func (m *Manager) Sources() []Source {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Source, 0, len(m.items))
	for _, tr := range m.items {
		var fps map[int]string
		if info := tr.t.Info(); info != nil {
			fps = make(map[int]string)
			for i, f := range tr.t.Files() {
				switch f.Priority() {
				case types.PiecePriorityHigh, types.PiecePriorityNow, types.PiecePriorityNext, types.PiecePriorityReadahead:
					fps[i] = "hi"
				case types.PiecePriorityNone:
					fps[i] = "off"
				}
			}
		} else {
			fps = tr.filePriorities
		}
		out = append(out, Source{Magnet: tr.magnet, Meta: tr.meta, Paused: tr.paused, DataDir: tr.dataDir, FilePriorities: fps})
	}
	return out
}

// Restore thêm lại một torrent đã lưu (giữ trạng thái tạm dừng).
func (m *Manager) Restore(s Source) error {
	if len(s.Meta) > 0 {
		return m.addTorrentData(s.Meta, s.Paused, s.DataDir, s.FilePriorities, false)
	}
	if s.Magnet != "" {
		return m.addMagnet(s.Magnet, s.Paused, s.DataDir, s.FilePriorities, false)
	}
	return fmt.Errorf("không có magnet hoặc metainfo")
}

// Close đóng client và dừng mọi torrent.
func (m *Manager) Close() {
	m.mu.Lock()
	c := m.client
	m.mu.Unlock()
	if c != nil {
		c.Close()
	}
}
