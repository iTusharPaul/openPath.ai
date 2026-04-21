const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
      ON users (LOWER(email));

    CREATE TABLE IF NOT EXISTS roadmaps (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      roadmap_name TEXT NOT NULL DEFAULT 'Untitled Roadmap',
      input_payload JSONB NOT NULL,
      result_payload JSONB NOT NULL,
      progress_payload JSONB NOT NULL DEFAULT '{"completed_concepts": []}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE roadmaps
      ADD COLUMN IF NOT EXISTS roadmap_name TEXT NOT NULL DEFAULT 'Untitled Roadmap';

    ALTER TABLE roadmaps
      ADD COLUMN IF NOT EXISTS progress_payload JSONB NOT NULL DEFAULT '{"completed_concepts": []}'::jsonb;

    CREATE INDEX IF NOT EXISTS roadmaps_user_created_at_idx
      ON roadmaps (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS roadmaps_user_id_idx
      ON roadmaps (user_id);
  `);
}

module.exports = { pool, ensureSchema };