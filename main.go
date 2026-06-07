package main

import (
	"embed"

	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// DNS qua HTTPS + tắt web security để can thiệp iframe cross-origin (bắt link tải)
	os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
		"--enable-features=dns-over-https "+
			"--dns-over-https-templates=\"https://dns.adguard-dns.com/dns-query\" "+
			"--disable-web-security "+
			"--disable-features=IsolateOrigins,site-per-process "+
			"--user-data-dir=\"$TEMP\\leakdownload-webview\"")

	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "leakdownload",
		Width:     1280,
		Height:    820,
		MinWidth:  1040,
		MinHeight: 600,
		EnableDefaultContextMenu: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 250, G: 248, B: 244, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		println("Lỗi:", err.Error())
	}
}
