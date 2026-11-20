-- Store only a remote thumbnail URL. Existing bookmarks retain a NULL image until refreshed.
ALTER TABLE bookmarks ADD COLUMN image_url TEXT;
