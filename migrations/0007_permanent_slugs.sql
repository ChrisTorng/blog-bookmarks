ALTER TABLE bookmarks ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_slug ON bookmarks(slug);
