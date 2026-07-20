package torrentsearch

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// Result is one torrent hit returned to the UI.
type Result struct {
	Name     string `json:"name"`
	InfoHash string `json:"infoHash"`
	Magnet   string `json:"magnet"`
	Size     int64  `json:"size"`
	Seeders  int    `json:"seeders"`
	Leechers int    `json:"leechers"`
	Source   string `json:"source"` // apibay | torrents-csv | jackett
	Category string `json:"category,omitempty"`
	Link     string `json:"link,omitempty"`
}

// Config selects which providers run and Jackett/Prowlarr credentials.
type Config struct {
	EnableApibay      bool
	EnableTorrentsCSV bool
	JackettURL        string
	JackettAPIKey     string
}

// Response is the aggregate search payload for the frontend.
type Response struct {
	Results []Result `json:"results"`
	Errors  []string `json:"errors"`
	Queried []string `json:"queried"`
}

// Service fans out queries to enabled providers.
type Service struct {
	client *http.Client
}

// New creates a Service with a shared HTTP client.
func New() *Service {
	return &Service{
		client: &http.Client{
			Timeout: 12 * time.Second,
			Transport: &http.Transport{
				Proxy:                 http.ProxyFromEnvironment,
				MaxIdleConns:          8,
				IdleConnTimeout:       30 * time.Second,
				TLSHandshakeTimeout:   8 * time.Second,
				ExpectContinueTimeout: 1 * time.Second,
			},
		},
	}
}

// Search runs all enabled providers in parallel and merges results.
func (s *Service) Search(ctx context.Context, query string, cfg Config) Response {
	q := strings.TrimSpace(query)
	if len([]rune(q)) < 2 {
		return Response{Errors: []string{"Từ khóa quá ngắn (tối thiểu 2 ký tự)"}}
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 14*time.Second)
	defer cancel()

	type job struct {
		name string
		fn   func(context.Context, string) ([]Result, error)
	}
	var jobs []job
	if cfg.EnableApibay {
		jobs = append(jobs, job{"apibay", s.searchApibay})
	}
	if cfg.EnableTorrentsCSV {
		jobs = append(jobs, job{"torrents-csv", s.searchTorrentsCSV})
	}
	if strings.TrimSpace(cfg.JackettURL) != "" && strings.TrimSpace(cfg.JackettAPIKey) != "" {
		url, key := cfg.JackettURL, cfg.JackettAPIKey
		jobs = append(jobs, job{"jackett", func(c context.Context, qq string) ([]Result, error) {
			return s.searchJackett(c, qq, url, key)
		}})
	}

	if len(jobs) == 0 {
		return Response{Errors: []string{"Không có nguồn tìm kiếm nào được bật. Mở Cài đặt để bật nguồn."}}
	}

	var (
		mu      sync.Mutex
		results []Result
		errors  []string
		queried []string
		wg      sync.WaitGroup
	)

	for _, j := range jobs {
		j := j
		wg.Add(1)
		go func() {
			defer wg.Done()
			rows, err := j.fn(ctx, q)
			mu.Lock()
			defer mu.Unlock()
			queried = append(queried, j.name)
			if err != nil {
				errors = append(errors, fmt.Sprintf("%s: %s", j.name, err.Error()))
				return
			}
			results = append(results, rows...)
		}()
	}
	wg.Wait()

	merged := mergeResults(results)
	return Response{Results: merged, Errors: errors, Queried: queried}
}

func mergeResults(in []Result) []Result {
	byHash := make(map[string]Result, len(in))
	for _, r := range in {
		h := NormalizeHash(r.InfoHash)
		if h == "" {
			continue
		}
		r.InfoHash = h
		if r.Magnet == "" {
			r.Magnet = BuildMagnet(h, r.Name)
		}
		if r.Name == "" {
			r.Name = h
		}
		prev, ok := byHash[h]
		if !ok {
			byHash[h] = r
			continue
		}
		// Keep the hit with more seeders; prefer richer magnet/name.
		if r.Seeders > prev.Seeders {
			if prev.Name != "" && r.Name == h {
				r.Name = prev.Name
			}
			byHash[h] = r
		} else if prev.Seeders == r.Seeders && len(r.Name) > len(prev.Name) {
			byHash[h] = r
		}
	}
	out := make([]Result, 0, len(byHash))
	for _, r := range byHash {
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Seeders != out[j].Seeders {
			return out[i].Seeders > out[j].Seeders
		}
		return out[i].Name < out[j].Name
	})
	// Cap list so UI stays snappy.
	const max = 200
	if len(out) > max {
		out = out[:max]
	}
	return out
}
