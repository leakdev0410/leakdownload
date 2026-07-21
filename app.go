package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	te "leakdownload/internal/torrentengine"
	ts "leakdownload/internal/torrentsearch"
)

// App là backend được bind sang JS. Mọi method viết hoa đều gọi được
// từ frontend qua window.go.main.App.<Tên>(...)
type App struct {
	ctx     context.Context
	mgr     *te.Manager
	search  *ts.Service
	dataDir string

	cfgMu             sync.Mutex
	downKB            int64
	upKB              int64
	cfgPath           string
	enableApibay      bool
	enableTorrentsCSV bool
	jackettURL        string
	jackettAPIKey     string
	maxActive         int  // 0 = không giới hạn torrent tải song song
	notifyOnComplete  bool // toast khi tải xong
	blockSeed         bool // true = chặn seed/upload (mặc định)
	mgrErr            string
}

// Settings là cấu hình gửi/nhận với frontend.
type Settings struct {
	DownloadDir        string `json:"downloadDir"`
	DownKBps           int64  `json:"downKBps"` // 0 = không giới hạn
	UpKBps             int64  `json:"upKBps"`
	EnableApibay       bool   `json:"enableApibay"`
	EnableTorrentsCSV  bool   `json:"enableTorrentsCSV"`
	JackettURL         string `json:"jackettURL"`
	JackettAPIKey      string `json:"jackettAPIKey"`
	MaxActiveDownloads int    `json:"maxActiveDownloads"` // 0 = không giới hạn
	NotifyOnComplete   bool   `json:"notifyOnComplete"`
	BlockSeed          bool   `json:"blockSeed"` // true = chặn seed
}

type persistedTorrent struct {
	Magnet         string         `json:"magnet,omitempty"`
	Meta           string         `json:"meta,omitempty"` // base64 nội dung .torrent
	Paused         bool           `json:"paused"`
	DataDir        string         `json:"dataDir,omitempty"`
	FilePriorities map[int]string `json:"filePriorities,omitempty"`
}

type persisted struct {
	DownloadDir         string             `json:"downloadDir"`
	DownKBps            int64              `json:"downKBps"`
	UpKBps              int64              `json:"upKBps"`
	EnableApibay        *bool              `json:"enableApibay,omitempty"`
	EnableTorrentsCSV   *bool              `json:"enableTorrentsCSV,omitempty"`
	JackettURL          string             `json:"jackettURL,omitempty"`
	JackettAPIKey       string             `json:"jackettAPIKey,omitempty"`
	MaxActiveDownloads *int               `json:"maxActiveDownloads,omitempty"`
	NotifyOnComplete   *bool              `json:"notifyOnComplete,omitempty"`
	BlockSeed          *bool              `json:"blockSeed,omitempty"`
	Torrents           []persistedTorrent `json:"torrents"`
}

func NewApp() *App {
	return &App{
		search:            ts.New(),
		enableApibay:      true,
		enableTorrentsCSV: true,
		maxActive:         0,    // mặc định không giới hạn
		notifyOnComplete:  true, // mặc định bật toast khi xong
		blockSeed:         true, // mặc định chặn seed
	}
}

// startup chạy khi app khởi động: nạp cấu hình, khởi tạo engine, khôi phục phiên.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	if dir, err := os.UserConfigDir(); err == nil {
		a.cfgPath = filepath.Join(dir, "leakdownload", "config.json")
	}
	cfg := a.loadConfig()

	a.dataDir = cfg.DownloadDir
	if a.dataDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "."
		}
		a.dataDir = filepath.Join(home, "Downloads", "leakdownload")
	}
	if err := os.MkdirAll(a.dataDir, 0o755); err != nil {
		wruntime.LogError(ctx, "không tạo được thư mục tải: "+err.Error())
		a.dataDir = os.TempDir() // Dự phòng vào thư mục Temp nếu không thể tạo thư mục cấu hình
	}

	a.downKB, a.upKB = cfg.DownKBps, cfg.UpKBps
	a.enableApibay = true
	a.enableTorrentsCSV = true
	if cfg.EnableApibay != nil {
		a.enableApibay = *cfg.EnableApibay
	}
	if cfg.EnableTorrentsCSV != nil {
		a.enableTorrentsCSV = *cfg.EnableTorrentsCSV
	}
	a.jackettURL = cfg.JackettURL
	a.jackettAPIKey = cfg.JackettAPIKey
	if cfg.MaxActiveDownloads != nil && *cfg.MaxActiveDownloads >= 0 {
		a.maxActive = *cfg.MaxActiveDownloads
	}
	if cfg.NotifyOnComplete != nil {
		a.notifyOnComplete = *cfg.NotifyOnComplete
	}
	if cfg.BlockSeed != nil {
		a.blockSeed = *cfg.BlockSeed
	}
	if a.search == nil {
		a.search = ts.New()
	}

	if err := a.initManager(); err != nil {
		wruntime.LogError(ctx, "không khởi tạo được torrent client: "+err.Error())
		// Vẫn cho UI/search chạy; AddMagnet sẽ thử init lại.
	} else if mgr := a.getMgr(); mgr != nil {
		mgr.SetMaxActive(a.maxActive)
		mgr.SetBlockSeed(a.blockSeed)
	}

	if mgr := a.getMgr(); mgr != nil {
		for _, pt := range cfg.Torrents {
			var meta []byte
			if pt.Meta != "" {
				var err error
				meta, err = base64.StdEncoding.DecodeString(pt.Meta)
				if err != nil {
					wruntime.LogError(ctx, "không giải mã metainfo: "+err.Error())
					continue
				}
			}
			if pt.Magnet == "" && len(meta) == 0 {
				continue
			}
			if err := mgr.Restore(te.Source{
				Magnet:         pt.Magnet,
				Meta:           meta,
				Paused:         pt.Paused,
				DataDir:        pt.DataDir,
				FilePriorities: pt.FilePriorities,
			}); err != nil {
				wruntime.LogError(ctx, "khôi phục torrent thất bại: "+err.Error())
			}
		}
	}

	wruntime.OnFileDrop(ctx, func(x, y int, paths []string) {
		if err := a.ensureManager(); err != nil {
			wruntime.LogError(a.ctx, "client chưa sẵn sàng (drop): "+err.Error())
			return
		}
		mgr := a.getMgr()
		if mgr == nil {
			return
		}
		added := false
		for _, p := range paths {
			if !strings.EqualFold(filepath.Ext(p), ".torrent") {
				continue
			}
			data, err := os.ReadFile(p)
			if err != nil {
				wruntime.LogError(a.ctx, "không đọc được file drop: "+err.Error())
				continue
			}
			if len(data) == 0 {
				continue
			}
			if err := mgr.AddTorrentData(data, true, false); err != nil {
				wruntime.LogError(a.ctx, "thêm torrent drop thất bại: "+err.Error())
				continue
			}
			added = true
		}
		if added {
			a.saveConfig()
			a.pushWith(mgr)
		}
	})

	go a.pushLoop()
}

// getMgr trả về torrent manager hiện tại (thread-safe).
func (a *App) getMgr() *te.Manager {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	return a.mgr
}

// initManager tạo torrent engine (gọi khi startup hoặc lazy retry).
func (a *App) initManager() error {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	if a.mgr != nil {
		return nil
	}
	dir := a.dataDir
	if dir == "" {
		dir = os.TempDir()
	}
	mgr, err := te.New(dir, a.downKB*1024, a.upKB*1024)
	if err != nil {
		a.mgrErr = err.Error()
		return fmt.Errorf("torrent client chưa sẵn sàng: %s", a.mgrErr)
	}
	mgr.SetMaxActive(a.maxActive)
	mgr.SetBlockSeed(a.blockSeed)
	a.mgr = mgr
	a.mgrErr = ""
	return nil
}

// ensureManager đảm bảo client sẵn sàng; thử khởi tạo lại nếu trước đó fail.
func (a *App) ensureManager() error {
	if a.getMgr() != nil {
		return nil
	}
	return a.initManager()
}

// shutdown đóng engine và lưu phiên khi tắt app.
func (a *App) shutdown(ctx context.Context) {
	a.saveConfig()
	if mgr := a.getMgr(); mgr != nil {
		mgr.Close()
	}
}

// pushLoop mỗi giây cập nhật tốc độ và bắn sự kiện trạng thái lên frontend.
func (a *App) pushLoop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			mgr := a.getMgr()
			if mgr == nil {
				continue
			}
			mgr.UpdateSpeeds(time.Second)
			a.pushWith(mgr)
		}
	}
}

func (a *App) push() {
	a.pushWith(a.getMgr())
}

func (a *App) pushWith(mgr *te.Manager) {
	if mgr == nil || a.ctx == nil {
		return
	}
	wruntime.EventsEmit(a.ctx, "torrents:update", mgr.Snapshot())
}

func (a *App) loadConfig() persisted {
	var cfg persisted
	if a.cfgPath == "" {
		return cfg
	}
	data, err := os.ReadFile(a.cfgPath)
	if err != nil {
		return cfg
	}
	_ = json.Unmarshal(data, &cfg)
	return cfg
}

// saveConfig lưu settings (+ danh sách torrent nếu engine sẵn sàng).
// Không yêu cầu mgr — vẫn lưu được nguồn search / thư mục / limit khi client lỗi.
func (a *App) saveConfig() {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	if a.cfgPath == "" {
		return
	}
	enApibay := a.enableApibay
	enCSV := a.enableTorrentsCSV
	maxActive := a.maxActive
	notify := a.notifyOnComplete
	blockSeed := a.blockSeed
	cfg := persisted{
		DownloadDir:        a.dataDir,
		DownKBps:           a.downKB,
		UpKBps:             a.upKB,
		EnableApibay:       &enApibay,
		EnableTorrentsCSV:  &enCSV,
		JackettURL:         a.jackettURL,
		JackettAPIKey:      a.jackettAPIKey,
		MaxActiveDownloads: &maxActive,
		NotifyOnComplete:   &notify,
		BlockSeed:          &blockSeed,
	}
	if a.mgr != nil {
		for _, s := range a.mgr.Sources() {
			pt := persistedTorrent{
				Magnet:         s.Magnet,
				Paused:         s.Paused,
				DataDir:        s.DataDir,
				FilePriorities: s.FilePriorities,
			}
			if len(s.Meta) > 0 {
				pt.Meta = base64.StdEncoding.EncodeToString(s.Meta)
			}
			cfg.Torrents = append(cfg.Torrents, pt)
		}
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		if a.ctx != nil {
			wruntime.LogError(a.ctx, "không marshal config: "+err.Error())
		}
		return
	}
	if err := os.MkdirAll(filepath.Dir(a.cfgPath), 0o755); err != nil {
		if a.ctx != nil {
			wruntime.LogError(a.ctx, "không tạo thư mục config: "+err.Error())
		}
		return
	}
	if err := os.WriteFile(a.cfgPath, data, 0o644); err != nil {
		if a.ctx != nil {
			wruntime.LogError(a.ctx, "không lưu được config: "+err.Error())
		}
	}
}

// ---- các method bind sang frontend ----

// AddMagnet thêm bằng magnet URI.
// startNow=false → tạm dừng; skipHash=true → bỏ qua kiểm tra piece ban đầu.
// Trả "" nếu OK, hoặc thông báo lỗi.
func (a *App) AddMagnet(uri string, startNow, skipHash bool) string {
	if err := a.ensureManager(); err != nil {
		return err.Error()
	}
	mgr := a.getMgr()
	if mgr == nil {
		return "torrent client chưa sẵn sàng"
	}
	uri = strings.TrimSpace(uri)
	if uri == "" {
		return "Magnet trống"
	}
	if !strings.HasPrefix(strings.ToLower(uri), "magnet:") {
		return "Magnet không hợp lệ (cần bắt đầu bằng magnet:)"
	}
	if err := mgr.AddMagnet(uri, startNow, skipHash); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.pushWith(mgr)
	return ""
}

// AddTorrentBase64 thêm torrent từ nội dung .torrent mã hóa base64 (từ dropzone frontend).
func (a *App) AddTorrentBase64(b64 string, startNow, skipHash bool) string {
	if err := a.ensureManager(); err != nil {
		return err.Error()
	}
	mgr := a.getMgr()
	if mgr == nil {
		return "torrent client chưa sẵn sàng"
	}
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return "Dữ liệu trống"
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "Không giải mã được base64: " + err.Error()
	}
	if len(data) == 0 {
		return "File torrent trống"
	}
	if err := mgr.AddTorrentData(data, startNow, skipHash); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.pushWith(mgr)
	return ""
}

// AddTorrentFile mở hộp thoại chọn file .torrent và thêm vào hàng đợi.
func (a *App) AddTorrentFile(startNow, skipHash bool) string {
	if err := a.ensureManager(); err != nil {
		return err.Error()
	}
	mgr := a.getMgr()
	if mgr == nil {
		return "torrent client chưa sẵn sàng"
	}
	path, err := wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "Chọn file .torrent",
		Filters: []wruntime.FileFilter{
			{DisplayName: "Torrent files (*.torrent)", Pattern: "*.torrent"},
		},
	})
	if err != nil {
		return err.Error()
	}
	if path == "" {
		return "" // người dùng bấm hủy
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err.Error()
	}
	if len(data) == 0 {
		return "File torrent trống"
	}
	if err := mgr.AddTorrentData(data, startNow, skipHash); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.pushWith(mgr)
	return ""
}

// GetSnapshot trả về trạng thái hiện tại (dùng khi frontend vừa load).
func (a *App) GetSnapshot() te.Snapshot {
	if mgr := a.getMgr(); mgr != nil {
		return mgr.Snapshot()
	}
	return te.Snapshot{Torrents: []te.TorrentView{}}
}

// GetDetail trả về chi tiết torrent đang chọn.
func (a *App) GetDetail(hash string) te.Detail {
	if mgr := a.getMgr(); mgr != nil {
		return mgr.Detail(hash)
	}
	return te.Detail{
		InfoHash: hash,
		Files:    []te.FileView{},
		Peers:    []te.PeerView{},
		Trackers: []te.TrackerView{},
	}
}

func (a *App) PauseTorrent(hash string) {
	if mgr := a.getMgr(); mgr != nil {
		mgr.Pause(hash)
		a.saveConfig()
		a.pushWith(mgr)
	}
}

func (a *App) ResumeTorrent(hash string) {
	if mgr := a.getMgr(); mgr != nil {
		mgr.Resume(hash)
		a.saveConfig()
		a.pushWith(mgr)
	}
}

func (a *App) PauseAll() {
	if mgr := a.getMgr(); mgr != nil {
		mgr.PauseAll()
		a.saveConfig()
		a.pushWith(mgr)
	}
}

func (a *App) ResumeAll() {
	if mgr := a.getMgr(); mgr != nil {
		mgr.ResumeAll()
		a.saveConfig()
		a.pushWith(mgr)
	}
}

func (a *App) RemoveTorrent(hash string) {
	if mgr := a.getMgr(); mgr != nil {
		mgr.Remove(hash)
		a.saveConfig()
		a.pushWith(mgr)
	}
}

// SetFilePriority đặt ưu tiên tệp: "hi" | "normal" | "off".
func (a *App) SetFilePriority(hash string, index int, prio string) {
	if mgr := a.getMgr(); mgr != nil {
		mgr.SetFilePriority(hash, index, prio)
		a.saveConfig()
	}
}

// GetSettings trả về cấu hình hiện tại cho hộp thoại Cài đặt.
func (a *App) GetSettings() Settings {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	return Settings{
		DownloadDir:        a.dataDir,
		DownKBps:           a.downKB,
		UpKBps:             a.upKB,
		EnableApibay:       a.enableApibay,
		EnableTorrentsCSV:  a.enableTorrentsCSV,
		JackettURL:         a.jackettURL,
		JackettAPIKey:      a.jackettAPIKey,
		MaxActiveDownloads: a.maxActive,
		NotifyOnComplete:   a.notifyOnComplete,
		BlockSeed:          a.blockSeed,
	}
}

// SaveSettings áp dụng cấu hình mới (giới hạn tốc độ + queue + thư mục + nguồn search) và lưu lại.
// Vẫn lưu được settings kể cả khi torrent client chưa sẵn sàng.
func (a *App) SaveSettings(s Settings) string {
	if s.DownKBps < 0 {
		s.DownKBps = 0
	}
	if s.UpKBps < 0 {
		s.UpKBps = 0
	}
	if s.MaxActiveDownloads < 0 {
		s.MaxActiveDownloads = 0
	}

	// Thử khởi tạo engine để áp dụng limit/dir/queue, nhưng không chặn lưu settings.
	_ = a.ensureManager()
	mgr := a.getMgr()
	if mgr != nil {
		mgr.SetSpeedLimit(s.DownKBps*1024, s.UpKBps*1024)
		mgr.SetMaxActive(s.MaxActiveDownloads)
		mgr.SetBlockSeed(s.BlockSeed)
	}

	a.cfgMu.Lock()
	a.downKB, a.upKB = s.DownKBps, s.UpKBps
	a.enableApibay = s.EnableApibay
	a.enableTorrentsCSV = s.EnableTorrentsCSV
	a.jackettURL = strings.TrimSpace(s.JackettURL)
	a.jackettAPIKey = strings.TrimSpace(s.JackettAPIKey)
	a.maxActive = s.MaxActiveDownloads
	a.notifyOnComplete = s.NotifyOnComplete
	a.blockSeed = s.BlockSeed
	oldDir := a.dataDir
	a.cfgMu.Unlock()

	if dir := strings.TrimSpace(s.DownloadDir); dir != "" && dir != oldDir {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err.Error()
		}
		if mgr != nil {
			mgr.SetDataDir(dir)
		}
		a.cfgMu.Lock()
		a.dataDir = dir
		a.cfgMu.Unlock()
	}
	a.saveConfig()
	if mgr != nil {
		a.pushWith(mgr)
	}
	return ""
}

// SearchTorrents tìm torrent từ các nguồn đã bật (public API + Jackett tùy chọn).
func (a *App) SearchTorrents(query string) ts.Response {
	if a.search == nil {
		a.search = ts.New()
	}
	a.cfgMu.Lock()
	cfg := ts.Config{
		EnableApibay:      a.enableApibay,
		EnableTorrentsCSV: a.enableTorrentsCSV,
		JackettURL:        a.jackettURL,
		JackettAPIKey:     a.jackettAPIKey,
	}
	a.cfgMu.Unlock()
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.search.Search(ctx, query, cfg)
}

func (a *App) ChooseDownloadDir() string {
	a.cfgMu.Lock()
	dir := a.dataDir
	a.cfgMu.Unlock()
	path, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title:            "Chọn thư mục lưu",
		DefaultDirectory: dir,
	})
	if err != nil {
		return ""
	}
	return path
}

// GetDownloadDir trả về đường dẫn thư mục lưu file.
func (a *App) GetDownloadDir() string {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	return a.dataDir
}

// OpenDownloadDir mở thư mục tải bằng trình quản lý file của hệ điều hành.
func (a *App) OpenDownloadDir() {
	a.cfgMu.Lock()
	dir := a.dataDir
	a.cfgMu.Unlock()
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", dir)
	case "darwin":
		cmd = exec.Command("open", dir)
	default:
		cmd = exec.Command("xdg-open", dir)
	}
	_ = cmd.Start()
}
