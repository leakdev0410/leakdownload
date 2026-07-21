package torrentsearch

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// apibay item fields (The Pirate Bay unofficial API).
type apibayItem struct {
	Name     string `json:"name"`
	InfoHash string `json:"info_hash"`
	Leechers string `json:"leechers"`
	Seeders  string `json:"seeders"`
	Size     string `json:"size"`
	Category string `json:"category"`
}

func (s *Service) searchApibay(ctx context.Context, query string) ([]Result, error) {
	u := "https://apibay.org/q.php?q=" + url.QueryEscape(query)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "leakdownload/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}

	// Empty / no results often returns [{"id":"0","name":"No results returned",...}]
	var items []apibayItem
	if err := json.Unmarshal(body, &items); err != nil {
		return nil, fmt.Errorf("parse JSON: %w", err)
	}

	out := make([]Result, 0, len(items))
	for _, it := range items {
		if strings.EqualFold(it.Name, "No results returned") || it.InfoHash == "0000000000000000000000000000000000000000" {
			continue
		}
		h := NormalizeHash(it.InfoHash)
		if h == "" {
			continue
		}
		size, _ := strconv.ParseInt(it.Size, 10, 64)
		seed, _ := strconv.Atoi(it.Seeders)
		leech, _ := strconv.Atoi(it.Leechers)
		name := htmlUnescape(it.Name)
		out = append(out, Result{
			Name:     name,
			InfoHash: h,
			Magnet:   BuildMagnet(h, name),
			Size:     size,
			Seeders:  seed,
			Leechers: leech,
			Source:   "apibay",
			Category: it.Category,
		})
	}
	return out, nil
}

func htmlUnescape(s string) string {
	// Named entities first (order matters for &amp;).
	replacer := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&apos;", "'",
		"&nbsp;", " ",
	)
	s = replacer.Replace(s)
	// Numeric entities: &#123; and &#x7b;
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); {
		if s[i] == '&' && i+2 < len(s) && s[i+1] == '#' {
			j := i + 2
			hex := false
			if s[j] == 'x' || s[j] == 'X' {
				hex = true
				j++
			}
			start := j
			for j < len(s) && ((s[j] >= '0' && s[j] <= '9') ||
				(hex && ((s[j] >= 'a' && s[j] <= 'f') || (s[j] >= 'A' && s[j] <= 'F')))) {
				j++
			}
			if j > start && j < len(s) && s[j] == ';' {
				numStr := s[start:j]
				var code int64
				var err error
				if hex {
					code, err = strconv.ParseInt(numStr, 16, 32)
				} else {
					code, err = strconv.ParseInt(numStr, 10, 32)
				}
				if err == nil && code >= 0 && code <= 0x10FFFF {
					b.WriteRune(rune(code))
					i = j + 1
					continue
				}
			}
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}
