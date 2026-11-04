-- v2 workflow: 0 unread, 1 read/undecided, 2 read/decided private,
-- 3 public, 4 recommended.
-- Preserve legacy status (0 unread, 1 read, 2 public, 3 recommended) for a safe rollout.
CREATE TABLE IF NOT EXISTS bookmark_status_before_stage_v2 (id TEXT PRIMARY KEY,legacy_status INTEGER NOT NULL,read_at TEXT,published_at TEXT,starred_at TEXT);
INSERT OR IGNORE INTO bookmark_status_before_stage_v2 SELECT id,status,read_at,published_at,starred_at FROM bookmarks;
ALTER TABLE bookmarks ADD COLUMN stage INTEGER NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 4);
UPDATE bookmarks SET stage=CASE status WHEN 2 THEN 3 WHEN 3 THEN 4 ELSE status END;
CREATE INDEX IF NOT EXISTS idx_bookmarks_stage_created ON bookmarks(stage,created_at DESC);
-- While older Workers may be running, mirror legacy writes to the new stage.
-- Modern Workers update both fields atomically, so the WHEN predicate excludes them.
CREATE TRIGGER IF NOT EXISTS bookmarks_legacy_sync_stage
AFTER UPDATE OF status ON bookmarks
WHEN NEW.stage=OLD.stage
BEGIN
 UPDATE bookmarks SET stage=CASE NEW.status WHEN 2 THEN 3 WHEN 3 THEN 4 ELSE NEW.status END WHERE id=NEW.id;
END;
