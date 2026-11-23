import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Prepares the configured database from the project's idempotent schema before Express accepts traffic.
 * It connects without selecting a database so a fresh TiDB/MySQL instance can create `DB_NAME`; existing
 * tables/data are preserved by the schema's CREATE IF NOT EXISTS and seed INSERT IGNORE statements.
 * @returns {Promise<void>} resolves after all schema statements have been accepted by MySQL.
 * @throws {Error} when DB_NAME is unsafe, the database is unreachable, or a schema statement fails.
 */
export async function initializeDatabase() {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(config.db.database)) throw new Error('DB_NAME solo puede contener letras, números y guion bajo.');
  const schemaPath = path.resolve(here, '../sql/schema.sql');
  const schema = (await readFile(schemaPath, 'utf8')).replace(/\bbaumar\b/g, config.db.database);
  const tls = config.databaseSsl ? { rejectUnauthorized: true, servername: config.db.host } : undefined;
  const { database: _database, ...connectionOptions } = config.db;
  const connection = await mysql.createConnection({
    ...connectionOptions,
    ...(tls ? { ssl: tls } : {}),
    timezone: 'Z',
    charset: 'utf8mb4',
    multipleStatements: true,
  });
  try {
    await connection.query(schema);
  } finally {
    await connection.end();
  }
}
