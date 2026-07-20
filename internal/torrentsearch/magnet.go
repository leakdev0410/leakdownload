package torrentsearch

import (
	"net/url"
	"strings"
)

// Common open trackers appended to magnets built from info-hash only.
var defaultTrackers = []string{
	"udp://tracker.opentrackr.org:1337/announce",
	"udp://open.stealth.si:80/announce",
	"udp://tracker.torrent.eu.org:451/announce",
	"udp://tracker.bittor.pw:1337/announce",
	"udp://tracker.moeking.me:6969/announce",
	"udp://exodus.desync.com:6969/announce",
	"udp://tracker.theoks.net:6969/announce",
	"http://tracker.openbittorrent.com:80/announce",
}

// BuildMagnet creates a magnet URI from an info-hash and display name.
func BuildMagnet(infoHash, name string) string {
	h := strings.ToLower(strings.TrimSpace(infoHash))
	if h == "" {
		return ""
	}
	var b strings.Builder
	b.WriteString("magnet:?xt=urn:btih:")
	b.WriteString(h)
	if n := strings.TrimSpace(name); n != "" {
		b.WriteString("&dn=")
		b.WriteString(url.QueryEscape(n))
	}
	for _, tr := range defaultTrackers {
		b.WriteString("&tr=")
		b.WriteString(url.QueryEscape(tr))
	}
	return b.String()
}

// NormalizeHash lowercases and strips non-hex characters from an info-hash.
func NormalizeHash(h string) string {
	h = strings.TrimSpace(strings.ToLower(h))
	var b strings.Builder
	for _, r := range h {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') {
			b.WriteRune(r)
		}
	}
	out := b.String()
	// v1 = 40 hex, v2 truncated sometimes 64 hex (sha256)
	if len(out) != 40 && len(out) != 64 {
		return ""
	}
	return out
}
