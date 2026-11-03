CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  status INTEGER NOT NULL DEFAULT 0 CHECK (status BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  read_at TEXT,
  published_at TEXT,
  starred_at TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS bookmark_tags (
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (bookmark_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_status_created
ON bookmarks(status, created_at DESC);
