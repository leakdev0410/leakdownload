//go:build !windows

package main

func getClipboardText() string {
	return ""
}
