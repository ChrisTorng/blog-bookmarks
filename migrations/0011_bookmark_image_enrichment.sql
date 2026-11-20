-- Track unsuccessful lookups to avoid repeatedly spending AI and publisher requests.
-- A user who deliberately clears an existing image disables automatic replacement.
ALTER TABLE bookmarks ADD COLUMN image_checked_at TEXT;
ALTER TABLE bookmarks ADD COLUMN image_suppressed INTEGER NOT NULL DEFAULT 0;
