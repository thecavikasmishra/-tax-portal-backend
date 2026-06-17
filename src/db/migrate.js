// src/db/migrate.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const schema = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  email            VARCHAR(255),
  phone            VARCHAR(20),
  pan              VARCHAR(10),
  unique_token     VARCHAR(50) UNIQUE NOT NULL,
  regime           VARCHAR(10) DEFAULT 'new' CHECK (regime IN ('old','new')),
  status           VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','partial','complete')),
  drive_folder_id  VARCHAR(255),
  financial_year   VARCHAR(10) DEFAULT '2024-25',
  notes            TEXT,
  last_activity    TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- Checklist sections
CREATE TABLE IF NOT EXISTS sections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL,
  icon       VARCHAR(50),
  sort_order INTEGER DEFAULT 0
);

-- Checklist items
CREATE TABLE IF NOT EXISTS checklist_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key     VARCHAR(50) REFERENCES sections(key),
  label           VARCHAR(255) NOT NULL,
  description     TEXT,
  is_deduction    BOOLEAN DEFAULT false,
  allows_multi    BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT true
);

-- Client responses per item
CREATE TABLE IF NOT EXISTS client_responses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID REFERENCES clients(id) ON DELETE CASCADE,
  item_id    UUID REFERENCES checklist_items(id),
  status     VARCHAR(20) CHECK (status IN ('yes','pending','na')),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, item_id)
);

-- Uploaded files
CREATE TABLE IF NOT EXISTS uploaded_files (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
  item_id        UUID REFERENCES checklist_items(id),
  original_name  VARCHAR(500),
  drive_file_id  VARCHAR(255),
  drive_url      VARCHAR(1000),
  drive_folder   VARCHAR(255),
  size_bytes     BIGINT,
  mime_type      VARCHAR(100),
  uploaded_at    TIMESTAMP DEFAULT NOW()
);

-- Admin users
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clients_token    ON clients(unique_token);
CREATE INDEX IF NOT EXISTS idx_clients_status   ON clients(status);
CREATE INDEX IF NOT EXISTS idx_responses_client ON client_responses(client_id);
CREATE INDEX IF NOT EXISTS idx_files_client     ON uploaded_files(client_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');
    await client.query(schema);
    console.log('✅ Schema created successfully');
    await client.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
