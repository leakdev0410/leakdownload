package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:                    "leakdownload",
		Width:                    1280,
		Height:                   820,
		MinWidth:                 960,
		MinHeight:                600,
		EnableDefaultContextMenu: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 245, G: 245, B: 247, A: 1},
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
