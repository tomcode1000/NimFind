-- Wallet owners who have signed in at least once.
CREATE TABLE users (
  address TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One-time sign in challenges, consumed on successful verification.
CREATE TABLE auth_challenges (
  nonce TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

-- A tag is one QR code attached to one item. The code is the public identifier.
CREATE TABLE tags (
  code TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL REFERENCES users(address),
  kind TEXT NOT NULL CHECK (kind IN ('phone', 'keys', 'bag', 'wallet', 'laptop', 'other')),
  label TEXT NOT NULL,
  note TEXT,
  reward_luna INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lost', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX tags_owner ON tags(owner_address);

-- A report is opened by a finder and becomes the private conversation for that find.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  tag_code TEXT NOT NULL REFERENCES tags(code),
  finder_token_hash TEXT NOT NULL,
  finder_address TEXT,
  reporter_ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'returned', 'closed')),
  reward_luna INTEGER NOT NULL DEFAULT 0,
  reward_data TEXT,
  reward_status TEXT NOT NULL DEFAULT 'none' CHECK (reward_status IN ('none', 'awaiting_payment', 'paid')),
  reward_tx_hash TEXT,
  reward_paid_luna INTEGER,
  reward_paid_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX reports_tag ON reports(tag_code, created_at);
CREATE INDEX reports_ip ON reports(reporter_ip_hash, created_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id),
  sender TEXT NOT NULL CHECK (sender IN ('owner', 'finder')),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_report ON messages(report_id, created_at);

-- Monthly Designer Pass, paid in NIM to the treasury address. One row per wallet per month.
CREATE TABLE passes (
  id TEXT PRIMARY KEY,
  buyer_address TEXT NOT NULL,
  period TEXT NOT NULL,
  price_luna INTEGER NOT NULL,
  payment_data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  UNIQUE (buyer_address, period)
);
