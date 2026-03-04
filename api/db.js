import { Pool } from 'pg';
import { DB_CONFIG } from './config.js';

export const pool = new Pool(DB_CONFIG);

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
