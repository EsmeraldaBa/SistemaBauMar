import mysql from 'mysql2/promise';
import { config } from './config.js';
import { instrumentDatabasePool, performanceAnalystAgent } from './agents/PerformanceAnalystAgent.js';

const tls = config.databaseSsl ? { rejectUnauthorized: true, servername: config.db.host } : undefined;
export const pool = instrumentDatabasePool(mysql.createPool({ ...config.db, ...(tls ? { ssl: tls } : {}), waitForConnections: true, connectionLimit: 5, namedPlaceholders: true, timezone: 'Z', charset: 'utf8mb4' }), performanceAnalystAgent);
// TiDB sessions store and compare DATETIME values in UTC; the driver also serializes dates in UTC above.
pool.on('connection', (connection) => connection.query("SET time_zone = '+00:00'"));
