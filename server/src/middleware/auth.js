import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Valida firma y vencimiento del token y vuelve a cargar estado/roles actuales desde MySQL. */
export const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error('Inicia sesión para continuar.'), { status: 401 });
  let claims;
  try { claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); }
  catch { throw Object.assign(new Error('Tu sesión venció o no es válida. Inicia sesión nuevamente.'), { status: 401 }); }
  const [rows] = await pool.execute(`SELECT u.user_id,u.username,u.email,u.first_name,u.last_name,u.phone_number,s.status_key,
      COALESCE(GROUP_CONCAT(r.role_key ORDER BY r.role_key SEPARATOR ','),'') AS role_keys
    FROM users u JOIN statuses s ON s.status_id=u.status_id LEFT JOIN user_roles ur ON ur.user_id=u.user_id LEFT JOIN roles r ON r.role_id=ur.role_id
    WHERE u.user_id=? GROUP BY u.user_id,s.status_key LIMIT 1`, [claims.sub]);
  const user = rows[0];
  if (!user || user.status_key !== 'active') throw Object.assign(new Error('La cuenta no está activa. Contacta con el administrador.'), { status: 401 });
  req.auth = { id: user.user_id, username: user.username, email: user.email, firstName: user.first_name, lastName: user.last_name, phoneNumber: user.phone_number, roles: user.role_keys ? user.role_keys.split(',') : [] };
  next();
});

/** Comprueba que el rol de administrador existe actualmente en la base de datos para cada operación protegida. */
export const requireAdministrator = (req, res, next) => {
  if (!req.auth?.roles.includes('administrator')) return res.status(403).json({ message: 'No tienes permisos de administrador para realizar esta operación.', requestId: req.requestId });
  next();
};

/** Restringe una operación a cualquiera de los roles indicados; la lista se comprueba en cada solicitud del servidor. */
export const requireAnyRole = (...allowedRoles) => (req, res, next) => {
  if (!req.auth?.roles.some((role) => allowedRoles.includes(role))) return res.status(403).json({ message: 'No tienes permisos para realizar esta operación.', requestId: req.requestId });
  next();
};
