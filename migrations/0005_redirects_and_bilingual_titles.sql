-- Preserve the original URL/title and the translated Traditional Chinese title separately.
-- Existing bookmarks keep their original values; no false claim about their original language.
ALTER TABLE bookmarks ADD COLUMN redirect_url TEXT;
ALTER TABLE bookmarks ADD COLUMN title_original TEXT;
ALTER TABLE bookmarks ADD COLUMN title_zh TEXT;
CREATE INDEX IF NOT EXISTS idx_bookmarks_redirect_url ON bookmarks(redirect_url);
