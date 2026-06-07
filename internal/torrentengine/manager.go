package torrentengine

import (
	"bytes"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
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
	StatusPaused      Status = "paused"      // tạm dừng
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
	Connections int   `json:"connections"`
	DhtNodes    int   `json:"dhtNodes"`
	DownLimit   int64 `json:"downLimit"` // bytes/s, 0 = không giới hạn
	UpLimit     int64 `json:"upLimit"`
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
	t         *torrent.Torrent
	paused    bool
	magnet    string // nguồn magnet (nếu thêm bằng magnet)
	meta      []byte // nguồn .torrent (nếu thêm bằng file)
	lastDone  int64
	lastUp    int64
	downSpeed int64
	upSpeed   int64
}

// Manager bọc một torrent.Client và quản lý nhiều torrent song song.
type Manager struct {
	mu      sync.Mutex
	client  *torrent.Client
	items   map[string]*tracked
	dataDir string
	downLim *rate.Limiter
	upLim   *rate.Limiter
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
		items:   make(map[string]*tracked),
		dataDir: dataDir,
		downLim: rate.NewLimiter(dl, db),
		upLim:   rate.NewLimiter(ul, ub),
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
	cfg.Seed = true
	cfg.DownloadRateLimiter = m.downLim
	cfg.UploadRateLimiter = m.upLim
	
	// Tối ưu hóa để tải nhanh nhất có thể:
	cfg.EstablishedConnsPerTorrent = 200 // Tăng số lượng kết nối tối đa mỗi torrent (mặc định 50)
	cfg.HalfOpenConnsPerTorrent = 100    // Tăng số lượng kết nối đang mở (mặc định 25)
	cfg.TorrentPeersHighWater = 1000     // Giữ trong bộ nhớ nhiều peer hơn để kết nối nhanh
	cfg.TorrentPeersLowWater = 200       // Ngưỡng tối thiểu peer
	cfg.DisableAcceptRateLimiting = true // Tắt giới hạn kết nối đến (chấp nhận kết nối vào nhanh hơn)
	
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

// AddMagnet thêm torrent từ magnet URI.
func (m *Manager) AddMagnet(uri string) error { return m.addMagnet(uri, false) }

func (m *Manager) addMagnet(uri string, paused bool) error {
	t, err := m.client.AddMagnet(uri)
	if err != nil {
		return err
	}
	m.register(t, paused, uri, nil)
	return nil
}

// AddTorrentData thêm torrent từ nội dung file .torrent.
func (m *Manager) AddTorrentData(data []byte) error { return m.addTorrentData(data, false) }

func (m *Manager) addTorrentData(data []byte, paused bool) error {
	mi, err := metainfo.Load(bytes.NewReader(data))
	if err != nil {
		return err
	}
	t, err := m.client.AddTorrent(mi)
	if err != nil {
		return err
	}
	m.register(t, paused, "", data)
	return nil
}

// register đưa torrent vào danh sách quản lý và bắt đầu tải khi có metadata.
func (m *Manager) register(t *torrent.Torrent, paused bool, magnet string, meta []byte) {
	h := t.InfoHash().HexString()

	m.mu.Lock()
	if _, exists := m.items[h]; exists {
		m.mu.Unlock()
		return // đã có rồi, bỏ qua trùng lặp
	}
	m.items[h] = &tracked{t: t, paused: paused, magnet: magnet, meta: meta}
	m.mu.Unlock()

	if paused {
		t.DisallowDataDownload()
	}

	go func() {
		<-t.GotInfo()
		m.mu.Lock()
		tr, ok := m.items[h]
		p := ok && tr.paused
		if ok && tr.meta == nil && tr.magnet != "" {
			if b, err := encodeMetainfo(t); err == nil {
				tr.meta = b // lưu metainfo để khôi phục phiên / đổi thư mục
			}
		}
		m.mu.Unlock()
		if ok && !p {
			t.DownloadAll()
		}
	}()
}

func encodeMetainfo(t *torrent.Torrent) ([]byte, error) {
	mi := t.Metainfo()
	var buf bytes.Buffer
	if err := mi.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Pause tạm dừng tải dữ liệu.
func (m *Manager) Pause(hash string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if tr, ok := m.items[hash]; ok {
		tr.paused = true
		tr.t.DisallowDataDownload()
	}
}

// Resume tiếp tục tải.
func (m *Manager) Resume(hash string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if tr, ok := m.items[hash]; ok {
		tr.paused = false
		tr.t.AllowDataDownload()
		if tr.t.Info() != nil {
			tr.t.DownloadAll()
		}
	}
}

// PauseAll tạm dừng tất cả.
func (m *Manager) PauseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, tr := range m.items {
		tr.paused = true
		tr.t.DisallowDataDownload()
	}
}

// ResumeAll tiếp tục tất cả.
func (m *Manager) ResumeAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, tr := range m.items {
		tr.paused = false
		tr.t.AllowDataDownload()
		if tr.t.Info() != nil {
			tr.t.DownloadAll()
		}
	}
}

// Remove gỡ torrent khỏi danh sách (không xóa file đã tải trên đĩa).
func (m *Manager) Remove(hash string) {
	m.mu.Lock()
	tr, ok := m.items[hash]
	if ok {
		delete(m.items, hash)
	}
	m.mu.Unlock()
	if ok {
		tr.t.Drop()
	}
}

// SetFilePriority đặt độ ưu tiên cho một tệp: "hi" | "normal" | "off".
func (m *Manager) SetFilePriority(hash string, index int, prio string) {
	m.mu.Lock()
	tr, ok := m.items[hash]
	m.mu.Unlock()
	if !ok || tr.t.Info() == nil {
		return
	}
	files := tr.t.Files()
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
		v.Name = "Đang lấy metadata…"
		v.Status = StatusMetadata
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
		}
	}
	stats.Total = len(views)
	stats.DhtNodes = m.dhtNodes()
	stats.DownLimit, stats.UpLimit = m.Limits()

	sort.Slice(views, func(i, j int) bool { return views[i].InfoHash < views[j].InfoHash })
	return Snapshot{Torrents: views, Stats: stats}
}

// dhtNodes đọc số node DHT bằng reflection vì DhtServer.Stats() trả về interface{}
// (kiểu cụ thể khác nhau giữa các phiên bản anacrolix).
func (m *Manager) dhtNodes() int {
	n := 0
	for _, s := range m.client.DhtServers() {
		v := reflect.ValueOf(s.Stats())
		if v.Kind() == reflect.Ptr {
			v = v.Elem()
		}
		if v.Kind() != reflect.Struct {
			continue
		}
		for _, name := range []string{"Nodes", "GoodNodes"} {
			f := v.FieldByName(name)
			if f.IsValid() && f.CanInt() {
				n += int(f.Int())
				break
			}
		}
	}
	return n
}

// Detail trả về chi tiết torrent đang chọn (tệp, peers, trackers, thông tin).
func (m *Manager) Detail(hash string) Detail {
	m.mu.Lock()
	tr, ok := m.items[hash]
	m.mu.Unlock()
	d := Detail{InfoHash: hash}
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
			Index: i,
			Path:  cleanFilePath(f.Path(), info.Name),
			Bytes: f.Length(),
		}
		if f.Length() > 0 {
			fv.Progress = float64(f.BytesCompleted()) / float64(f.Length()) * 100
		}
		switch f.Priority() {
		case types.PiecePriorityNone:
			fv.Priority = "off"
		case types.PiecePriorityHigh, types.PiecePriorityNow, types.PiecePriorityNext, types.PiecePriorityReadahead:
			fv.Priority = "hi"
		default:
			fv.Priority = "normal"
		}
		d.Files = append(d.Files, fv)
	}
	return d
}

func cleanFilePath(p, root string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	p = strings.TrimPrefix(p, root+"/")
	return p
}

// Source là nguồn (magnet/meta) + trạng thái để lưu phiên / đổi thư mục.
type Source struct {
	Magnet string
	Meta   []byte
	Paused bool
}

// Sources trả về nguồn của mọi torrent hiện có.
func (m *Manager) Sources() []Source {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Source, 0, len(m.items))
	for _, tr := range m.items {
		out = append(out, Source{Magnet: tr.magnet, Meta: tr.meta, Paused: tr.paused})
	}
	return out
}

// Restore thêm lại một torrent đã lưu (giữ trạng thái tạm dừng).
func (m *Manager) Restore(s Source) {
	if len(s.Meta) > 0 {
		_ = m.addTorrentData(s.Meta, s.Paused)
	} else if s.Magnet != "" {
		_ = m.addMagnet(s.Magnet, s.Paused)
	}
}

// Reconfigure tạo lại client với thư mục lưu mới, thêm lại các torrent hiện có.
func (m *Manager) Reconfigure(newDataDir string) error {
	srcs := m.Sources()

	m.mu.Lock()
	old := m.client
	c, err := torrent.NewClient(m.config(newDataDir))
	if err != nil {
		m.mu.Unlock()
		return err
	}
	m.client = c
	m.dataDir = newDataDir
	m.items = make(map[string]*tracked)
	m.mu.Unlock()

	old.Close()

	for _, s := range srcs {
		m.Restore(s)
	}
	return nil
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
