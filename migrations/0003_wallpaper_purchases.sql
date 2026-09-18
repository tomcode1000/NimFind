-- One paid designer wallpaper. Bought in Nimiq Pay, confirmed on chain, spent on one saved image.
CREATE TABLE wallpaper_purchases (
  id TEXT PRIMARY KEY,
  buyer_address TEXT NOT NULL,
  price_luna INTEGER NOT NULL,
  payment_data TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  -- Which wallpaper it was spent on, so saving the same one again does not charge twice.
  used_at INTEGER,
  used_code TEXT,
  used_design TEXT
);
CREATE INDEX wallpaper_purchases_buyer ON wallpaper_purchases(buyer_address, status, used_at);
