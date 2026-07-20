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
	mgrErr            string // lỗi khởi tạo client gần nhất (nếu có)
}

// Settings là cấu hình gửi/nhận với frontend.
type Settings struct {
	DownloadDir       string `json:"downloadDir"`
	DownKBps          int64  `json:"downKBps"` // 0 = không giới hạn
	UpKBps            int64  `json:"upKBps"`
	EnableApibay      bool   `json:"enableApibay"`
	EnableTorrentsCSV bool   `json:"enableTorrentsCSV"`
	JackettURL        string `json:"jackettURL"`
	JackettAPIKey     string `json:"jackettAPIKey"`
}

type persistedTorrent struct {
	Magnet         string         `json:"magnet,omitempty"`
	Meta           string         `json:"meta,omitempty"` // base64 nội dung .torrent
	Paused         bool           `json:"paused"`
	DataDir        string         `json:"dataDir,omitempty"`
	FilePriorities map[int]string `json:"filePriorities,omitempty"`
}

type persisted struct {
	DownloadDir       string             `json:"downloadDir"`
	DownKBps          int64              `json:"downKBps"`
	UpKBps            int64              `json:"upKBps"`
	EnableApibay      *bool              `json:"enableApibay,omitempty"`
	EnableTorrentsCSV *bool              `json:"enableTorrentsCSV,omitempty"`
	JackettURL        string             `json:"jackettURL,omitempty"`
	JackettAPIKey     string             `json:"jackettAPIKey,omitempty"`
	Torrents          []persistedTorrent `json:"torrents"`
}

func NewApp() *App {
	return &App{
		search:            ts.New(),
		enableApibay:      true,
		enableTorrentsCSV: true,
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
	if a.search == nil {
		a.search = ts.New()
	}

	if err := a.initManager(); err != nil {
		wruntime.LogError(ctx, "không khởi tạo được torrent client: "+err.Error())
		// Vẫn cho UI/search chạy; AddMagnet sẽ thử init lại.
	}

	for _, pt := range cfg.Torrents {
		if a.mgr == nil {
			break
		}
		var meta []byte
		if pt.Meta != "" {
			var err error
			meta, err = base64.StdEncoding.DecodeString(pt.Meta)
			if err != nil {
				wruntime.LogError(ctx, "không giải mã metainfo: "+err.Error())
				continue
			}
		}
		if err := a.mgr.Restore(te.Source{
			Magnet:         pt.Magnet,
			Meta:           meta,
			Paused:         pt.Paused,
			DataDir:        pt.DataDir,
			FilePriorities: pt.FilePriorities,
		}); err != nil {
			wruntime.LogError(ctx, "khôi phục torrent thất bại: "+err.Error())
		}
	}

	wruntime.OnFileDrop(ctx, func(x, y int, paths []string) {
		if err := a.ensureManager(); err != nil {
			wruntime.LogError(a.ctx, "client chưa sẵn sàng (drop): "+err.Error())
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
			if err := a.mgr.AddTorrentData(data, true, false); err != nil {
				wruntime.LogError(a.ctx, "thêm torrent drop thất bại: "+err.Error())
				continue
			}
			added = true
		}
		if added {
			a.saveConfig()
			a.push()
		}
	})

	go a.pushLoop()
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
		return err
	}
	a.mgr = mgr
	a.mgrErr = ""
	return nil
}

// ensureManager đảm bảo client sẵn sàng; thử khởi tạo lại nếu trước đó fail.
func (a *App) ensureManager() error {
	a.cfgMu.Lock()
	ok := a.mgr != nil
	a.cfgMu.Unlock()
	if ok {
		return nil
	}
	if err := a.initManager(); err != nil {
		if a.mgrErr != "" {
			return fmt.Errorf("torrent client chưa sẵn sàng: %s", a.mgrErr)
		}
		return fmt.Errorf("torrent client chưa sẵn sàng: %w", err)
	}
	return nil
}

// shutdown đóng engine và lưu phiên khi tắt app.
func (a *App) shutdown(ctx context.Context) {
	a.saveConfig()
	if a.mgr != nil {
		a.mgr.Close()
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
			if a.mgr != nil {
				a.mgr.UpdateSpeeds(time.Second)
				a.push()
			}
		}
	}
}

func (a *App) push() {
	if a.mgr != nil {
		wruntime.EventsEmit(a.ctx, "torrents:update", a.mgr.Snapshot())
	}
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

func (a *App) saveConfig() {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	if a.cfgPath == "" || a.mgr == nil {
		return
	}
	enApibay := a.enableApibay
	enCSV := a.enableTorrentsCSV
	cfg := persisted{
		DownloadDir:       a.dataDir,
		DownKBps:          a.downKB,
		UpKBps:            a.upKB,
		EnableApibay:      &enApibay,
		EnableTorrentsCSV: &enCSV,
		JackettURL:        a.jackettURL,
		JackettAPIKey:     a.jackettAPIKey,
	}
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
	uri = strings.TrimSpace(uri)
	if uri == "" {
		return "Magnet trống"
	}
	if err := a.mgr.AddMagnet(uri, startNow, skipHash); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.push()
	return ""
}

// AddTorrentBase64 thêm torrent từ nội dung .torrent mã hóa base64 (từ dropzone frontend).
func (a *App) AddTorrentBase64(b64 string, startNow, skipHash bool) string {
	if err := a.ensureManager(); err != nil {
		return err.Error()
	}
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return "Dữ liệu trống"
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "Không giải mã được base64: " + err.Error()
	}
	if err := a.mgr.AddTorrentData(data, startNow, skipHash); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.push()
	return ""
}

// AddTorrentFile mở hộp thoại chọn file .torrent và thêm vào hàng đợi.
func (a *App) AddTorrentFile(startNow, skipHash bool) string {
	if err := a.ensureManager(); err != nil {
		return err.Error()
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
	if err := a.mgr.AddTorrentData(data, startNow, skipHash); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.push()
	return ""
}

// GetSnapshot trả về trạng thái hiện tại (dùng khi frontend vừa load).
func (a *App) GetSnapshot() te.Snapshot {
	if a.mgr == nil {
		return te.Snapshot{Torrents: []te.TorrentView{}}
	}
	return a.mgr.Snapshot()
}

// GetDetail trả về chi tiết torrent đang chọn.
func (a *App) GetDetail(hash string) te.Detail {
	if a.mgr == nil {
		return te.Detail{}
	}
	return a.mgr.Detail(hash)
}

func (a *App) PauseTorrent(hash string) {
	if a.mgr != nil {
		a.mgr.Pause(hash)
		a.saveConfig()
		a.push()
	}
}

func (a *App) ResumeTorrent(hash string) {
	if a.mgr != nil {
		a.mgr.Resume(hash)
		a.saveConfig()
		a.push()
	}
}

func (a *App) PauseAll() {
	if a.mgr != nil {
		a.mgr.PauseAll()
		a.saveConfig()
		a.push()
	}
}

func (a *App) ResumeAll() {
	if a.mgr != nil {
		a.mgr.ResumeAll()
		a.saveConfig()
		a.push()
	}
}

func (a *App) RemoveTorrent(hash string) {
	if a.mgr != nil {
		a.mgr.Remove(hash)
		a.saveConfig()
		a.push()
	}
}

// SetFilePriority đặt ưu tiên tệp: "hi" | "normal" | "off".
func (a *App) SetFilePriority(hash string, index int, prio string) {
	if a.mgr != nil {
		a.mgr.SetFilePriority(hash, index, prio)
		a.saveConfig()
	}
}

// GetSettings trả về cấu hình hiện tại cho hộp thoại Cài đặt.
func (a *App) GetSettings() Settings {
	a.cfgMu.Lock()
	defer a.cfgMu.Unlock()
	return Settings{
		DownloadDir:       a.dataDir,
		DownKBps:          a.downKB,
		UpKBps:            a.upKB,
		EnableApibay:      a.enableApibay,
		EnableTorrentsCSV: a.enableTorrentsCSV,
		JackettURL:        a.jackettURL,
		JackettAPIKey:     a.jackettAPIKey,
	}
}

// SaveSettings áp dụng cấu hình mới (giới hạn tốc độ + thư mục lưu + nguồn search) và lưu lại.
func (a *App) SaveSettings(s Settings) string {
	if err := a.ensureManager(); err != nil {
		return err.Error()
	}
	if s.DownKBps < 0 {
		s.DownKBps = 0
	}
	if s.UpKBps < 0 {
		s.UpKBps = 0
	}
	a.mgr.SetSpeedLimit(s.DownKBps*1024, s.UpKBps*1024)

	a.cfgMu.Lock()
	a.downKB, a.upKB = s.DownKBps, s.UpKBps
	a.enableApibay = s.EnableApibay
	a.enableTorrentsCSV = s.EnableTorrentsCSV
	a.jackettURL = strings.TrimSpace(s.JackettURL)
	a.jackettAPIKey = strings.TrimSpace(s.JackettAPIKey)
	oldDir := a.dataDir
	a.cfgMu.Unlock()

	if dir := strings.TrimSpace(s.DownloadDir); dir != "" && dir != oldDir {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err.Error()
		}
		a.mgr.SetDataDir(dir)
		a.cfgMu.Lock()
		a.dataDir = dir
		a.cfgMu.Unlock()
	}
	a.saveConfig()
	a.push()
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
