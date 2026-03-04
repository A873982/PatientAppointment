import fs from 'fs/promises';
import path from 'path';
import { MIGRATIONS_DIR } from './config.js';
import { pool } from './db.js';

const MAX_ATTEMPTS = Number(process.env.MIGRATION_MAX_ATTEMPTS || 20);
const RETRY_DELAY_MS = Number(process.env.MIGRATION_RETRY_DELAY_MS || 3000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      file_name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const result = await pool.query('SELECT file_name FROM schema_migrations');
  return new Set(result.rows.map((row) => row.file_name));
}

async function applyMigration(fileName) {
  const fullPath = path.join(MIGRATIONS_DIR, fileName);
  const sql = await fs.readFile(fullPath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (file_name) VALUES ($1)', [fileName]);
    await client.query('COMMIT');
    console.log(`Applied migration: ${fileName}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function run() {
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    try {
      await ensureMigrationsTable();
      const applied = await getAppliedMigrations();
      const files = (await fs.readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (!applied.has(file)) {
          await applyMigration(file);
        }
      }
      return;
    } catch (err) {
      const canRetry = attempt < MAX_ATTEMPTS;
      console.error(`Migration attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err?.message || err);
      if (!canRetry) throw err;
      await sleep(RETRY_DELAY_MS);
    }
  }
}

run()
  .then(() => {
    console.log('Migrations complete.');
    return pool.end();
  })
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await pool.end();
    process.exit(1);
  });
