-- Maintain per-tag counts incrementally, avoiding repeated full bookmark_tags joins.
-- A publish/unpublish, category edit, or bookmark deletion updates counts immediately.
CREATE TABLE bookmark_tag_counts (
  tag_id TEXT PRIMARY KEY REFERENCES tags(id) ON DELETE CASCADE,
  all_count INTEGER NOT NULL DEFAULT 0 CHECK(all_count >= 0),
  public_count INTEGER NOT NULL DEFAULT 0 CHECK(public_count >= 0)
);

INSERT INTO bookmark_tag_counts(tag_id, all_count, public_count)
SELECT bt.tag_id,
       COUNT(*),
       SUM(CASE WHEN b.stage >= 3 THEN 1 ELSE 0 END)
FROM bookmark_tags bt
JOIN bookmarks b ON b.id = bt.bookmark_id
GROUP BY bt.tag_id;

CREATE TRIGGER bookmark_tag_counts_insert AFTER INSERT ON bookmark_tags
BEGIN
  INSERT INTO bookmark_tag_counts(tag_id, all_count, public_count)
  VALUES (NEW.tag_id, 1,
    (SELECT CASE WHEN stage >= 3 THEN 1 ELSE 0 END FROM bookmarks WHERE id = NEW.bookmark_id))
  ON CONFLICT(tag_id) DO UPDATE SET
    all_count = all_count + 1,
    public_count = public_count + excluded.public_count;
END;

-- On a cascading bookmark deletion, the parent bookmark may be gone already.
-- In that case the BEFORE DELETE trigger below already handled its public count.
CREATE TRIGGER bookmark_tag_counts_delete AFTER DELETE ON bookmark_tags
BEGIN
  UPDATE bookmark_tag_counts SET
    all_count = all_count - 1,
    public_count = public_count - COALESCE(
      (SELECT CASE WHEN stage >= 3 THEN 1 ELSE 0 END
       FROM bookmarks WHERE id = OLD.bookmark_id), 0)
  WHERE tag_id = OLD.tag_id;
END;

CREATE TRIGGER bookmark_tag_counts_bookmark_delete BEFORE DELETE ON bookmarks
WHEN OLD.stage >= 3
BEGIN
  UPDATE bookmark_tag_counts SET public_count = public_count - 1
  WHERE tag_id IN (
    SELECT tag_id FROM bookmark_tags WHERE bookmark_id = OLD.id
  );
END;

CREATE TRIGGER bookmark_tag_counts_stage AFTER UPDATE OF stage ON bookmarks
WHEN (OLD.stage >= 3) <> (NEW.stage >= 3)
BEGIN
  UPDATE bookmark_tag_counts SET
    public_count = public_count + CASE WHEN NEW.stage >= 3 THEN 1 ELSE -1 END
  WHERE tag_id IN (
    SELECT tag_id FROM bookmark_tags WHERE bookmark_id = NEW.id
  );
END;

-- Match the public list's status_at expression (not private created_at sorting).
-- Existing ORDER BY status_at DESC, b.id DESC can use this partial index.
CREATE INDEX idx_bookmarks_public_status_order
ON bookmarks (
  (CASE WHEN stage = 4 THEN COALESCE(starred_at, published_at, created_at)
        WHEN stage = 3 THEN COALESCE(published_at, created_at)
        ELSE created_at END) DESC,
  id DESC
)
WHERE stage >= 3;
