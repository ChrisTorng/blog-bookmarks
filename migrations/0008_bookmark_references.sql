-- Existing bookmarks default to no additional references.
-- JSON array of {url,title,kind}; supports several links without extra lookups per public item.
ALTER TABLE bookmarks ADD COLUMN references TEXT NOT NULL DEFAULT '[]';
