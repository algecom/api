-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  uid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE businesses (
  uid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_behaviour INTEGER, -- 0: inform 1: sell
  ai_system_prompt TEXT,
  status INTEGER NOT NULL DEFAULT 0, -- 0: testing 1: live 2: stoped
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE business_users (
  business_uid UUID REFERENCES businesses(uid) ON DELETE CASCADE,
  user_uid UUID REFERENCES users(uid) ON DELETE CASCADE,
  role TEXT,
  PRIMARY KEY (business_uid, user_uid)
);

CREATE TABLE facebook_users (
  user_uid UUID REFERENCES users(uid) ON DELETE CASCADE,
  id TEXT NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (user_uid, id)
);

CREATE TABLE facebook_pages (
  business_uid UUID REFERENCES businesses(uid) ON DELETE CASCADE,
  id TEXT NOT NULL PRIMARY KEY,
  token TEXT NOT NULL
);

CREATE TABLE google_sheets (
  user_uid UUID PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  token TEXT NOT NULL,
  refresh_token TEXT NOT NULL
);

CREATE TABLE business_sheet (
  business_uid UUID REFERENCES businesses(uid) ON DELETE CASCADE,
  id TEXT PRIMARY KEY
);