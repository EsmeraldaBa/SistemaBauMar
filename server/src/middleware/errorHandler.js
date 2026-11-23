import { logEvent } from '../utils/logger.js';

/** Registra contexto no sensible en archivo y convierte excepciones internas a JSON seguro para la interfaz. */
export async function errorHandler(error, req, res, _next) {
  const status = error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 500);
  let duplicateMessage = null;
  if (error.code === 'ER_DUP_ENTRY') {
    const key = String(error.sqlMessage || '');
    duplicateMessage = key.includes('uq_roles_') ? 'El rol ya existe.' : key.includes('uq_users_email') ? 'Ese correo ya está registrado.' : key.includes('uq_users_username') ? 'Ese nombre de usuario ya está registrado.' : key.includes('uq_user_role') ? 'Ese usuario ya tiene asignado ese rol.' : key.includes('uq_workshop') ? 'Ya existe un taller con ese nombre o RFC.' : key.includes('uq_customer_email') ? 'Ese correo ya está registrado.' : key.includes('uq_vehicle_plate') ? 'Esa placa ya está registrada.' : key.includes('uq_vehicle_vin') ? 'Ese VIN ya está registrado.' : 'Ese dato ya está registrado.';
  }
  await logEvent(status >= 500 ? 'error' : 'warn', error.message || 'Error inesperado', {
    module: req.baseUrl || 'http', endpoint: req.originalUrl, method: req.method,
    userId: req.auth?.id || null, requestId: req.requestId, code: error.code || null,
    stack: status >= 500 ? error.stack : undefined,
  });
  const message = error.publicMessage || (status >= 500 ? 'Error interno del servidor. El incidente quedó registrado.' : duplicateMessage || error.message);
  res.status(status).json({ message, ...(error.details ? { details: error.details } : {}), requestId: req.requestId });
}
