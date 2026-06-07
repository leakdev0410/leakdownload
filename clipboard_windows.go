//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

var (
	user32                       = syscall.NewLazyDLL("user32.dll")
	kernel32                     = syscall.NewLazyDLL("kernel32.dll")
	procOpenClipboard            = user32.NewProc("OpenClipboard")
	procCloseClipboard           = user32.NewProc("CloseClipboard")
	procGetClipboardData         = user32.NewProc("GetClipboardData")
	procGlobalLock               = kernel32.NewProc("GlobalLock")
	procGlobalUnlock             = kernel32.NewProc("GlobalUnlock")
	procIsClipboardFormatAvailable = user32.NewProc("IsClipboardFormatAvailable")
)

const (
	cfUnicodeText = 13
	cfText        = 1
)

func readClipboardWindows() string {
	// Mở clipboard
	r, _, _ := procOpenClipboard.Call(0)
	if r == 0 {
		return ""
	}
	defer procCloseClipboard.Call()

	// Kiểm tra có Unicode text không
	r, _, _ = procIsClipboardFormatAvailable.Call(cfUnicodeText)
	if r == 0 {
		return ""
	}

	// Lấy dữ liệu
	h, _, _ := procGetClipboardData.Call(cfUnicodeText)
	if h == 0 {
		return ""
	}

	// Khóa bộ nhớ
	p, _, _ := procGlobalLock.Call(h)
	if p == 0 {
		return ""
	}
	defer procGlobalUnlock.Call(h)

	// Đọc UTF-16 string đến null terminator
	return syscall.UTF16ToString((*[1 << 20]uint16)(unsafe.Pointer(p))[:])
}
