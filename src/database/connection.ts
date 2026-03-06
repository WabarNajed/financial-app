import knex, { Knex } from 'knex';
import { env } from '../config';
import logger from '../utils/logger';

let db: Knex;

export function getDb(): Knex {
  if (!db) {
    db = knex({
      client: 'pg',
      connection: {
        host: env.DB_HOST,
        port: env.DB_PORT,
        database: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
      },
      pool: { min: 2, max: 10 },
      migrations: {
        directory: __dirname + '/migrations',
      },
    });
  }
  return db;
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDb().raw('SELECT 1');
    logger.info('Database connection established');
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error });
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    logger.info('Database connection closed');
  }
}
