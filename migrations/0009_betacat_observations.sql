-- Only observed articles from the user's authenticated BetaCats userscript.
-- Snapshot listing != consciously rejected item; viewed_summary is separate evidence.
CREATE TABLE IF NOT EXISTS betacat_observations (
  url TEXT PRIMARY KEY,
  title_original TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  hn_id TEXT,
  source_page TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 0,
  summary_viewed_at TEXT,
  summary_view_count INTEGER NOT NULL DEFAULT 0,
  points INTEGER,
  comments INTEGER,
  prediction TEXT,
  prediction_version TEXT,
  prediction_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_betacat_observations_viewed ON betacat_observations(summary_viewed_at);
CREATE TABLE IF NOT EXISTS betacat_snapshot_items (
  snapshot_id TEXT NOT NULL,
  url TEXT NOT NULL,
  page_loaded_at TEXT NOT NULL,
  source_page TEXT NOT NULL,
  was_bookmarked INTEGER NOT NULL DEFAULT 0,
  viewed_summary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_id,url)
);
CREATE INDEX IF NOT EXISTS idx_betacat_snapshot_items_url ON betacat_snapshot_items(url);

CREATE TABLE IF NOT EXISTS betacat_bookmark_actions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 snapshot_id TEXT,
 url TEXT NOT NULL,
 selected INTEGER NOT NULL,
 acted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_betacat_bookmark_actions_url ON betacat_bookmark_actions(url,acted_at);
