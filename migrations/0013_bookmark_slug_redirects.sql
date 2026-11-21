-- Preserve the original RSS identifier on migrated bookmarks without changing all 631 URLs.
ALTER TABLE bookmarks ADD COLUMN rss_guid TEXT;
-- Old links resolve to the new canonical permalink and remain usable in old feeds.
CREATE TABLE IF NOT EXISTS bookmark_slug_redirects (
  slug TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bookmark_slug_redirect_id ON bookmark_slug_redirects(bookmark_id);
