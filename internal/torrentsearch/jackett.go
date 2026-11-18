package torrentsearch

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Jackett JSON API: /api/v2.0/indexers/all/results
type jackettResponse struct {
	Results []jackettItem `json:"Results"`
}

type jackettItem struct {
	Title        string `json:"Title"`
	Guid         string `json:"Guid"`
	Link         string `json:"Link"`
	Details      string `json:"Details"`
	MagnetUri    string `json:"MagnetUri"`
	InfoHash     string `json:"InfoHash"`
	Size         int64  `json:"Size"`
	Seeders      int    `json:"Seeders"`
	Peers        int    `json:"Peers"`
	Tracker      string `json:"Tracker"`
	CategoryDesc string `json:"CategoryDesc"`
}

func (s *Service) searchJackett(ctx context.Context, query, baseURL, apiKey string) ([]Result, error) {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return nil, fmt.Errorf("URL trống")
	}
	// Accept bare host or full Jackett path.
	endpoint := base
	if !strings.Contains(strings.ToLower(base), "/api/") {
		endpoint = base + "/api/v2.0/indexers/all/results"
	}

	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("URL không hợp lệ: %w", err)
	}
	q := u.Query()
	q.Set("apikey", strings.TrimSpace(apiKey))
	q.Set("Query", query)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
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
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		msg := strings.TrimSpace(string(b))
		if msg != "" {
			return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, msg)
		}
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}

	var parsed jackettResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("parse JSON: %w", err)
	}

	out := make([]Result, 0, len(parsed.Results))
	for _, it := range parsed.Results {
		h := NormalizeHash(it.InfoHash)
		magnet := strings.TrimSpace(it.MagnetUri)
		if magnet == "" && strings.HasPrefix(strings.ToLower(it.Link), "magnet:") {
			magnet = it.Link
		}
		if h == "" && magnet != "" {
			h = hashFromMagnet(magnet)
		}
		if h == "" && magnet == "" {
			continue
		}
		if magnet == "" {
			magnet = BuildMagnet(h, it.Title)
		}
		leech := it.Peers
		if leech < 0 {
			leech = 0
		}
		// Jackett Peers is often seeders+leechers; approximate leechers.
		if leech >= it.Seeders {
			leech = leech - it.Seeders
		}
		src := "jackett"
		if t := strings.TrimSpace(it.Tracker); t != "" {
			src = "jackett:" + t
		}
		out = append(out, Result{
			Name:     it.Title,
			InfoHash: h,
			Magnet:   magnet,
			Size:     it.Size,
			Seeders:  it.Seeders,
			Leechers: leech,
			Source:   src,
			Category: it.CategoryDesc,
			Link:     firstNonEmpty(it.Details, it.Guid, it.Link),
		})
	}
	return out, nil
}

func hashFromMagnet(m string) string {
	// magnet:?xt=urn:btih:HASH or urn:btmh:1220HASH
	low := strings.ToLower(m)
	for _, marker := range []string{"urn:btmh:", "urn:btih:"} {
		i := strings.Index(low, marker)
		if i < 0 {
			continue
		}
		rest := m[i+len(marker):]
		end := len(rest)
		for j, r := range rest {
			if r == '&' || r == '"' {
				end = j
				break
			}
		}
		if h := NormalizeHash(rest[:end]); h != "" {
			return h
		}
	}
	return ""
}

func firstNonEmpty(ss ...string) string {
	for _, s := range ss {
		if strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}
