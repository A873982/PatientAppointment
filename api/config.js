import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DIST_DIR = path.join(ROOT_DIR, 'dist');
export const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export const PORT = Number(process.env.PORT || 8080);

export const DB_CONFIG = (() => {
  const instance = process.env.INSTANCE_CONNECTION_NAME;
  const host = process.env.DB_HOST || (instance ? `/cloudsql/${instance}` : '127.0.0.1');
  const port = Number(process.env.DB_PORT || 5432);

  return {
    host,
    port,
    database: process.env.DB_NAME || 'patient_appointment',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  };
})();
