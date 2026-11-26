-- Private article-reading metadata, independent of published short summaries.
CREATE TABLE article_reading (
 url TEXT PRIMARY KEY,
 chars INTEGER,
 words INTEGER,
 minutes INTEGER,
 cjk INTEGER,
 english INTEGER,
 source TEXT,
 body TEXT,
 body_hash TEXT,
 captured_at TEXT,
 fetch_at TEXT,
 summary TEXT,
 summary_hash TEXT,
 summary_version TEXT,
 automatic INTEGER NOT NULL DEFAULT 0,
 lease_until TEXT,
 error TEXT
);
CREATE INDEX article_reading_captured_at ON article_reading(captured_at);
CREATE TABLE article_reading_budget (
 day TEXT PRIMARY KEY,
 total INTEGER NOT NULL DEFAULT 0,
 automatic INTEGER NOT NULL DEFAULT 0
);
