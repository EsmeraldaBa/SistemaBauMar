import mysql from 'mysql2/promise';
import { config } from './config.js';
import { instrumentDatabasePool, performanceAnalystAgent } from './agents/PerformanceAnalystAgent.js';

export const pool = instrumentDatabasePool(mysql.createPool({ ...config.db, waitForConnections: true, connectionLimit: 10, namedPlaceholders: true, timezone: 'Z', charset: 'utf8mb4' }), performanceAnalystAgent);
