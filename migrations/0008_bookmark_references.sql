-- Existing bookmarks default to no additional references.
-- JSON array of {url,title,kind}; supports several links without extra lookups per public item.
ALTER TABLE bookmarks ADD COLUMN reference_links TEXT NOT NULL DEFAULT '[]';
