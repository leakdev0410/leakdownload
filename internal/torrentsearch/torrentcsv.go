package torrentsearch

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

type csvResponse struct {
	Torrents []csvItem `json:"torrents"`
}

type csvItem struct {
	InfoHash string `json:"infohash"`
	Name     string `json:"name"`
	Size     int64  `json:"size_bytes"`
	Seeders  int    `json:"seeders"`
	Leechers int    `json:"leechers"`
}

func (s *Service) searchTorrentsCSV(ctx context.Context, query string) ([]Result, error) {
	u := "https://torrents-csv.com/service/search?q=" + url.QueryEscape(query) + "&size=50"
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

	var parsed csvResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		// Some deployments return a bare array.
		var arr []csvItem
		if err2 := json.Unmarshal(body, &arr); err2 != nil {
			return nil, fmt.Errorf("parse JSON: %w", err)
		}
		parsed.Torrents = arr
	}

	out := make([]Result, 0, len(parsed.Torrents))
	for _, it := range parsed.Torrents {
		h := NormalizeHash(it.InfoHash)
		if h == "" {
			continue
		}
		name := htmlUnescape(it.Name)
		out = append(out, Result{
			Name:     name,
			InfoHash: h,
			Magnet:   BuildMagnet(h, name),
			Size:     it.Size,
			Seeders:  it.Seeders,
			Leechers: it.Leechers,
			Source:   "torrents-csv",
		})
	}
	return out, nil
}
