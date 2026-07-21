package torrentsearch

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestBuildMagnet(t *testing.T) {
	m := BuildMagnet("2C6B6858D61DA9543D4231A71DB4B1C9264B0685", "Ubuntu")
	if !strings.HasPrefix(m, "magnet:?xt=urn:btih:2c6b6858") {
		t.Fatalf("magnet prefix: %s", m)
	}
	if !strings.Contains(m, "dn=Ubuntu") {
		t.Fatalf("missing dn: %s", m)
	}
	if !strings.Contains(m, "tr=") {
		t.Fatalf("missing trackers: %s", m)
	}
}

func TestNormalizeHash(t *testing.T) {
	if got := NormalizeHash("2C6B6858D61DA9543D4231A71DB4B1C9264B0685"); len(got) != 40 {
		t.Fatalf("got %q", got)
	}
	if got := NormalizeHash("zz"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
	if got := NormalizeHash("  abcd  "); got != "" {
		t.Fatalf("short hash should be empty, got %q", got)
	}
}

func TestMergeResultsPrefersHigherSeeders(t *testing.T) {
	h := "2c6b6858d61da9543d4231a71db4b1c9264b0685"
	in := []Result{
		{Name: "A", InfoHash: h, Seeders: 1, Size: 10, Magnet: "magnet:?xt=urn:btih:" + h},
		{Name: "Better Name Long", InfoHash: strings.ToUpper(h), Seeders: 50, Size: 99, Magnet: "magnet:?xt=urn:btih:" + h + "&dn=x"},
		{Name: "dup", InfoHash: h, Seeders: 5, Size: 1},
	}
	out := mergeResults(in)
	if len(out) != 1 {
		t.Fatalf("want 1 merged, got %d", len(out))
	}
	if out[0].Seeders != 50 {
		t.Fatalf("want seeders 50, got %d", out[0].Seeders)
	}
	if out[0].InfoHash != h {
		t.Fatalf("hash not normalized: %s", out[0].InfoHash)
	}
}

func TestSearchRejectsShortQuery(t *testing.T) {
	s := New()
	res := s.Search(context.Background(), "a", Config{EnableApibay: true})
	if len(res.Errors) == 0 {
		t.Fatal("expected error for short query")
	}
}

func TestSearchNoProviders(t *testing.T) {
	s := New()
	res := s.Search(context.Background(), "ubuntu", Config{})
	if len(res.Errors) == 0 {
		t.Fatal("expected error when no providers enabled")
	}
}

func TestSearchApibayLive(t *testing.T) {
	if testing.Short() {
		t.Skip("live network")
	}
	s := New()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	res := s.Search(ctx, "ubuntu", Config{EnableApibay: true})
	if len(res.Results) == 0 && len(res.Errors) > 0 {
		t.Logf("search errors (network may be blocked): %v", res.Errors)
		t.Skip("no results — network or API unavailable")
	}
	if len(res.Results) == 0 {
		t.Fatal("expected at least one result for ubuntu")
	}
	r := res.Results[0]
	if r.Magnet == "" || r.InfoHash == "" {
		t.Fatalf("incomplete result: %+v", r)
	}
}
