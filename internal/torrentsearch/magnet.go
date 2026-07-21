package torrentsearch

import (
	"encoding/base32"
	"encoding/hex"
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
// infoHash should already be normalized hex (40 or 64 chars).
func BuildMagnet(infoHash, name string) string {
	h := NormalizeHash(infoHash)
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

// NormalizeHash accepts hex (40/64) or base32 (32-char) v1 info-hashes and
// returns lowercase hex, or "" if invalid.
func NormalizeHash(h string) string {
	h = strings.TrimSpace(h)
	if h == "" {
		return ""
	}
	// Strip common urn prefixes.
	low := strings.ToLower(h)
	if strings.HasPrefix(low, "urn:btih:") {
		h = h[len("urn:btih:"):]
		low = strings.ToLower(h)
	}

	// Prefer hex: keep only [0-9a-f].
	var hexOnly strings.Builder
	for _, r := range low {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') {
			hexOnly.WriteRune(r)
		}
	}
	out := hexOnly.String()
	// v1 = 40 hex, v2 truncated sometimes 64 hex (sha256)
	if len(out) == 40 || len(out) == 64 {
		return out
	}

	// Base32 v1 (32 chars, RFC 4648 alphabet without padding). Common in magnets.
	var b32 strings.Builder
	for _, r := range strings.ToUpper(strings.TrimSpace(h)) {
		if (r >= 'A' && r <= 'Z') || (r >= '2' && r <= '7') {
			b32.WriteRune(r)
		}
	}
	raw := b32.String()
	if len(raw) != 32 {
		return ""
	}
	// BitTorrent base32 is unpadded; StdEncoding needs padding to multiple of 8.
	padded := raw
	if m := len(padded) % 8; m != 0 {
		padded += strings.Repeat("=", 8-m)
	}
	decoded, err := base32.StdEncoding.DecodeString(padded)
	if err != nil || len(decoded) != 20 {
		return ""
	}
	return hex.EncodeToString(decoded)
}
