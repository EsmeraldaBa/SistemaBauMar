import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const logDirectory = path.resolve(here, '../../logs');
/**
 * Añade un evento como JSON Lines sin persistir cuerpos HTTP, contraseñas ni tokens.
 * @param {'info'|'warn'|'error'} level severidad del evento.
 * @param {string} message resumen técnico apto para log.
 * @param {object} [details] contexto no sensible, como ruta, método, folio o usuario.
 * @returns {Promise<void>} se resuelve tras escribir; si falla, informa por consola sin detener la API.
 */
export async function logEvent(level, message, details = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, details });
  try { await mkdir(logDirectory, { recursive: true }); await appendFile(path.join(logDirectory, 'application.log'), `${line}\n`, 'utf8'); }
  catch (error) { console.error('No se pudo escribir el log:', error.message, line); }
  if (level === 'error') console.error(line);
}
