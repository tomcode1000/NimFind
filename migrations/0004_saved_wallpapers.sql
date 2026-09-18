-- The wallpaper an owner last made for a tag, so it comes back when they sign in again.
-- A paid design stays paid for that tag: opening it later never charges twice.
CREATE TABLE wallpapers (
  tag_code TEXT PRIMARY KEY REFERENCES tags(code),
  owner_address TEXT NOT NULL,
  design TEXT NOT NULL,
  filter TEXT NOT NULL DEFAULT 'original',
  x REAL NOT NULL,
  y REAL NOT NULL,
  contrast TEXT NOT NULL DEFAULT 'blend',
  calendar INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  paid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX wallpapers_owner ON wallpapers(owner_address, updated_at);
