package torrentengine

import (
	"testing"

	"golang.org/x/time/rate"
)

func TestCleanFilePath(t *testing.T) {
	cases := []struct {
		path, root, want string
	}{
		{"Movie/file.mkv", "Movie", "file.mkv"},
		{"movie/file.mkv", "Movie", "file.mkv"},
		{"file.mkv", "Movie", "file.mkv"},
		{`Movie\file.mkv`, "Movie", "file.mkv"},
		{"./Movie/file.mkv", "Movie", "file.mkv"},
		{"alone.mkv", "", "alone.mkv"},
		{"", "root", ""},
	}
	for _, tc := range cases {
		got := cleanFilePath(tc.path, tc.root)
		if got != tc.want {
			t.Errorf("cleanFilePath(%q, %q) = %q, want %q", tc.path, tc.root, got, tc.want)
		}
	}
}

func TestSetMaxActiveClamps(t *testing.T) {
	m := &Manager{items: make(map[string]*tracked)}
	m.SetMaxActive(-3)
	if m.MaxActive() != 0 {
		t.Fatalf("want 0, got %d", m.MaxActive())
	}
	m.SetMaxActive(5)
	if m.MaxActive() != 5 {
		t.Fatalf("want 5, got %d", m.MaxActive())
	}
}

func TestMakeLimit(t *testing.T) {
	lim, burst := makeLimit(0)
	if lim != rate.Inf {
		t.Fatalf("unlimited want Inf, got %v", lim)
	}
	if burst < limiterBurst {
		t.Fatalf("burst too small: %d", burst)
	}

	lim2, burst2 := makeLimit(1024)
	if lim2 != rate.Limit(1024) {
		t.Fatalf("limit want 1024, got %v", lim2)
	}
	if burst2 < limiterBurst {
		t.Fatalf("burst should be at least limiterBurst, got %d", burst2)
	}

	lim3, burst3 := makeLimit(1 << 20)
	if lim3 != rate.Limit(1<<20) {
		t.Fatalf("limit want 1MiB/s, got %v", lim3)
	}
	if burst3 != 1<<20 {
		t.Fatalf("burst want 1MiB, got %d", burst3)
	}
}
