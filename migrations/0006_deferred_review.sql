-- Deferred items remain in stage=1 internally, with an independent flag.
-- This preserves stage CHECK(0..4) and all existing 0..4 API statuses.
-- API status 5 is a virtual representation of stage=1 + deferred=1.
ALTER TABLE bookmarks ADD COLUMN deferred INTEGER NOT NULL DEFAULT 0 CHECK(deferred IN (0,1));
CREATE INDEX IF NOT EXISTS idx_bookmarks_deferred_created ON bookmarks(deferred,stage,created_at);
