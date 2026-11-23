import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logEvent } from './utils/logger.js';
import { performanceAnalystAgent } from './agents/PerformanceAnalystAgent.js';
import { initializeDatabase } from './dbSetup.js';

if (config.jwtSecret.length < 32) throw new Error('Configura JWT_SECRET con al menos 32 caracteres en el archivo .env.');
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin(origin, callback) {
  if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
  return callback(Object.assign(new Error('Origen no autorizado por CORS.'), { status: 403 }));
} }));
// El margen contempla la codificación Base64 de imágenes de vehículo de hasta 15 MB.
app.use(express.json({ limit: '22mb' }));
app.use((req, res, next) => { req.requestId = randomUUID(); res.setHeader('X-Request-Id', req.requestId); next(); });
app.use(performanceAnalystAgent.middleware());
app.get('/api/health', async (req, res, next) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch (error) { error.status = 503; error.message = 'Database connection failed'; error.publicMessage = 'Error al conectarse con la base de datos. Verifica que MySQL esté en ejecución.'; next(error); }
});
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customer', customerRoutes);
app.use('/uploads/workshops', express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads/workshops'), { fallthrough: false, index: false, dotfiles: 'deny' }));
app.use('/uploads/vehicles', express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads/vehicles'), { fallthrough: false, index: false, dotfiles: 'deny' }));
app.use((req, _res, next) => next(Object.assign(new Error('No se encontró el endpoint solicitado.'), { status: 404 })));
app.use(errorHandler);

if (process.env.RENDER === 'true' || process.env.INITIALIZE_DATABASE === 'true') {
  try {
    await initializeDatabase();
  } catch (error) {
    await logEvent('error', 'No se pudo inicializar el esquema de base de datos', { module: 'startup', code: error.code || null, message: error.message });
    throw error;
  }
}
const server = app.listen(config.port, () => logEvent('info', 'API BauMar iniciada', { module: 'startup', port: config.port }));
process.on('unhandledRejection', (reason) => logEvent('error', 'Promesa rechazada sin manejar', { module: 'process', reason: String(reason) }));
process.on('uncaughtException', async (error) => { await logEvent('error', 'Excepción no capturada; API detenida', { module: 'process', message: error.message, stack: error.stack }); server.close(() => process.exit(1)); });
