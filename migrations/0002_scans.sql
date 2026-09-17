-- Each time a finder opens a tag page. Shown to the owner as "Scanned just now", never to finders.
CREATE TABLE scans (
  id TEXT PRIMARY KEY,
  tag_code TEXT NOT NULL REFERENCES tags(code),
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX scans_tag ON scans(tag_code, created_at);
