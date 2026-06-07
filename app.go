package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	te "leakdownload/internal/torrentengine"
)

// App là backend được bind sang JS. Mọi method viết hoa đều gọi được
// từ frontend qua window.go.main.App.<Tên>(...)
type App struct {
	ctx     context.Context
	mgr     *te.Manager
	dataDir string

	cfgMu       sync.Mutex
	downKB      int64
	upKB        int64
	cfgPath     string
	catchServer *http.Server
}

// Settings là cấu hình gửi/nhận với frontend.
type Settings struct {
	DownloadDir string `json:"downloadDir"`
	DownKBps    int64  `json:"downKBps"` // 0 = không giới hạn
	UpKBps      int64  `json:"upKBps"`
}

type persistedTorrent struct {
	Magnet string `json:"magnet,omitempty"`
	Meta   string `json:"meta,omitempty"` // base64 nội dung .torrent
	Paused bool   `json:"paused"`
}

type persisted struct {
	DownloadDir string             `json:"downloadDir"`
	DownKBps    int64              `json:"downKBps"`
	UpKBps      int64              `json:"upKBps"`
	Torrents    []persistedTorrent `json:"torrents"`
}

func NewApp() *App { return &App{} }

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
	}

	a.downKB, a.upKB = cfg.DownKBps, cfg.UpKBps

	mgr, err := te.New(a.dataDir, a.downKB*1024, a.upKB*1024)
	if err != nil {
		wruntime.LogError(ctx, "không khởi tạo được torrent client: "+err.Error())
		return
	}
	a.mgr = mgr

	for _, pt := range cfg.Torrents {
		var meta []byte
		if pt.Meta != "" {
			meta, _ = base64.StdEncoding.DecodeString(pt.Meta)
		}
		a.mgr.Restore(te.Source{Magnet: pt.Magnet, Meta: meta, Paused: pt.Paused})
	}

	wruntime.OnFileDrop(ctx, func(x, y int, paths []string) {
		added := false
		for _, p := range paths {
			if !strings.EqualFold(filepath.Ext(p), ".torrent") {
				continue
			}
			data, err := os.ReadFile(p)
			if err != nil {
				continue
			}
			if err := a.mgr.AddTorrentData(data); err == nil {
				added = true
			}
		}
		if added {
			a.saveConfig()
			a.push()
		}
	})

	go a.pushLoop()
	go a.clipboardWatcher()
	go a.startCatchServer()
}

// shutdown đóng engine và lưu phiên khi tắt app.
func (a *App) shutdown(ctx context.Context) {
	a.saveConfig()
	if a.catchServer != nil {
		a.catchServer.Close()
	}
	if a.mgr != nil {
		a.mgr.Close()
	}
}

// pushLoop mỗi giây cập nhật tốc độ và bắn sự kiện trạng thái lên frontend.
func (a *App) pushLoop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if a.mgr != nil {
			a.mgr.UpdateSpeeds(time.Second)
			a.push()
		}
	}
}

func (a *App) push() {
	if a.mgr != nil {
		wruntime.EventsEmit(a.ctx, "torrents:update", a.mgr.Snapshot())
	}
}

// clipboardWatcher theo dõi clipboard, phát hiện link .torrent thì thêm vào torrent engine.
func (a *App) clipboardWatcher() {
	var last string
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		text := getClipboardText()
		text = strings.TrimSpace(text)
		if text == "" || text == last || len(text) > 2000 {
			continue
		}
		last = text
		if strings.HasPrefix(text, "http") && strings.HasSuffix(strings.ToLower(strings.Split(text, "?")[0]), ".torrent") {
			a.AddTorrentURL(text)
		}
	}
}

// ---- cấu hình / lưu phiên ----

// startCatchServer chạy HTTP server local nhận link tải từ Chrome extension.
func (a *App) startCatchServer() {
	mux := http.NewServeMux()
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/catch", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		body, _ := io.ReadAll(r.Body)
		var req struct {
			URL      string `json:"url"`
			FileName string `json:"filename"`
		}
		json.Unmarshal(body, &req)
		if req.URL != "" && strings.HasPrefix(req.URL, "http") {
			if strings.HasSuffix(strings.ToLower(strings.Split(req.URL, "?")[0]), ".torrent") && a.mgr != nil {
				a.AddTorrentURL(req.URL)
			}
		}
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	})

	wruntime.LogInfo(a.ctx, "Catch server started on 127.0.0.1:19876")
	server := &http.Server{Addr: "127.0.0.1:19876", Handler: mux}
	a.catchServer = server
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		wruntime.LogError(a.ctx, "Catch server: "+err.Error())
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
	cfg := persisted{
		DownloadDir: a.dataDir,
		DownKBps:    a.downKB,
		UpKBps:      a.upKB,
	}
	for _, s := range a.mgr.Sources() {
		pt := persistedTorrent{Magnet: s.Magnet, Paused: s.Paused}
		if len(s.Meta) > 0 {
			pt.Meta = base64.StdEncoding.EncodeToString(s.Meta)
		}
		cfg.Torrents = append(cfg.Torrents, pt)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(a.cfgPath), 0o755)
	_ = os.WriteFile(a.cfgPath, data, 0o644)
}

// ---- các method bind sang frontend ----

// AddMagnet thêm bằng magnet URI. Trả "" nếu OK, hoặc thông báo lỗi.
func (a *App) AddMagnet(uri string) string {
	if a.mgr == nil {
		return "Client chưa sẵn sàng"
	}
	uri = strings.TrimSpace(uri)
	if uri == "" {
		return "Magnet trống"
	}
	if err := a.mgr.AddMagnet(uri); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.push()
	return ""
}

// AddTorrentURL tải file .torrent từ URL và thêm vào torrent engine.
func (a *App) AddTorrentURL(url string) string {
	if a.mgr == nil {
		return "Client chưa sẵn sàng"
	}
	url = strings.TrimSpace(url)
	if url == "" {
		return "URL trống"
	}
	if !strings.HasPrefix(url, "http") {
		return "URL không hợp lệ"
	}
	// Tải nội dung file .torrent
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err.Error()
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err.Error()
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // max 10MB
	if err != nil {
		return err.Error()
	}
	if len(data) == 0 {
		return "File .torrent rỗng"
	}
	if err := a.mgr.AddTorrentData(data); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.push()
	return ""
}

// AddTorrentBase64 thêm torrent từ nội dung .torrent mã hóa base64 (từ dropzone frontend).
func (a *App) AddTorrentBase64(b64 string) string {
	if a.mgr == nil {
		return "Client chưa sẵn sàng"
	}
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return "Dữ liệu trống"
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "Không giải mã được base64: " + err.Error()
	}
	if err := a.mgr.AddTorrentData(data); err != nil {
		return err.Error()
	}
	a.saveConfig()
	a.push()
	return ""
}

// AddTorrentFile mở hộp thoại chọn file .torrent và thêm vào hàng đợi.
func (a *App) AddTorrentFile() string {
	if a.mgr == nil {
		return "Client chưa sẵn sàng"
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
	if err := a.mgr.AddTorrentData(data); err != nil {
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
	}
}

// GetSettings trả về cấu hình hiện tại cho hộp thoại Cài đặt.
func (a *App) GetSettings() Settings {
	return Settings{DownloadDir: a.dataDir, DownKBps: a.downKB, UpKBps: a.upKB}
}

// SaveSettings áp dụng cấu hình mới (giới hạn tốc độ + thư mục lưu) và lưu lại.
func (a *App) SaveSettings(s Settings) string {
	if a.mgr == nil {
		return "Client chưa sẵn sàng"
	}
	if s.DownKBps < 0 {
		s.DownKBps = 0
	}
	if s.UpKBps < 0 {
		s.UpKBps = 0
	}
	a.downKB, a.upKB = s.DownKBps, s.UpKBps
	a.mgr.SetSpeedLimit(a.downKB*1024, a.upKB*1024)

	if dir := strings.TrimSpace(s.DownloadDir); dir != "" && dir != a.dataDir {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err.Error()
		}
		if err := a.mgr.Reconfigure(dir); err != nil {
			return err.Error()
		}
		a.dataDir = dir
	}
	a.saveConfig()
	a.push()
	return ""
}

// ChooseDownloadDir mở hộp thoại chọn thư mục, trả về đường dẫn (chưa áp dụng).
func (a *App) ChooseDownloadDir() string {
	path, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title:            "Chọn thư mục lưu",
		DefaultDirectory: a.dataDir,
	})
	if err != nil {
		return ""
	}
	return path
}

// GetDownloadDir trả về đường dẫn thư mục lưu file.
func (a *App) GetDownloadDir() string { return a.dataDir }

// OpenDownloadDir mở thư mục tải bằng trình quản lý file của hệ điều hành.
func (a *App) OpenDownloadDir() {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", a.dataDir)
	case "darwin":
		cmd = exec.Command("open", a.dataDir)
	default:
		cmd = exec.Command("xdg-open", a.dataDir)
	}
	_ = cmd.Start()
}
