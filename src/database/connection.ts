import knex, { Knex } from 'knex';
import { env } from '../config';
import logger from '../utils/logger';

let db: Knex | null = null;
let dbAvailable = false;

/**
 * Build Knex connection config.
 * Supports DATABASE_URL (single string) or split DB_* variables.
 */
function buildConnectionConfig(): Knex.Config {
  if (env.DATABASE_URL) {
    return {
      client: 'pg',
      connection: env.DATABASE_URL,
      pool: { min: 0, max: 10 },
    };
  }

  return {
    client: 'pg',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    },
    pool: { min: 0, max: 10 },
  };
}

export function getDb(): Knex {
  if (!db) {
    db = knex(buildConnectionConfig());
  }
  return db;
}

export function isDatabaseAvailable(): boolean {
  return dbAvailable;
}

/**
 * Test the database connection.
 * If DB credentials are not provided, skip silently.
 */
export async function testConnection(): Promise<boolean> {
  // If no password and no DATABASE_URL, the DB is intentionally unconfigured
  if (!env.DATABASE_URL && !env.DB_PASSWORD) {
    logger.warn('Database not configured (no DB_PASSWORD or DATABASE_URL). Running in DB-less mode.');
    dbAvailable = false;
    return false;
  }

  try {
    const conn = getDb();
    await conn.raw('SELECT 1');
    dbAvailable = true;
    logger.info('Database connection established');
    return true;
  } catch (error: any) {
    dbAvailable = false;
    // Log useful details without exposing password
    const detail = error?.code === 'ECONNREFUSED'
      ? `Connection refused at ${env.DB_HOST}:${env.DB_PORT}. Is PostgreSQL running?`
      : error?.code === '3D000'
        ? `Database "${env.DB_NAME}" does not exist. Run: CREATE DATABASE ${env.DB_NAME};`
        : error?.code === '28P01'
          ? `Authentication failed for user "${env.DB_USER}". Check DB_PASSWORD.`
          : `${error?.code || 'UNKNOWN'}: ${error?.message || error}`;

    logger.error(`Database connection failed: ${detail}`);
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
    dbAvailable = false;
    logger.info('Database connection closed');
  }
}
