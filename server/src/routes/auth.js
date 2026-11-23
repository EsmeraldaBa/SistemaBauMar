import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { uuidv7 } from '../utils/uuidv7.js';
import { hashPassword, verifyPassword, hashToken } from '../utils/passwords.js';
import { UserFactory } from '../services/userFactory.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { logEvent } from '../utils/logger.js';

const router = Router();
const roles = ['owner', 'receptionist', 'service_advisor', 'technician', 'customer', 'system'];
async function persistUser(input, connection) {
  const created = UserFactory.create({ ...input, passwordHash: hashPassword(input.password) });
  await connection.execute('INSERT INTO users (id,email,password_hash,full_name,phone,role) VALUES (?,?,?,?,?,?)', [created.userId, created.user.email, created.user.passwordHash, created.user.fullName, created.user.phone, created.user.role]);
  await connection.execute(`INSERT INTO ${created.profileTable} (id,user_id,${created.extraColumn}) VALUES (?,?,?)`, [created.profileId, created.userId, created.extraValue]);
  return created.userId;
}

router.get('/setup-status', async (_req, res, next) => {
  try { const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM users'); res.json({ needsOwner: row.total === 0 }); } catch (e) { next(e); }
});

router.post('/setup-owner', async (req, res, next) => {
  const { email, password, fullName, workshopName } = req.body;
  if (!email || !password || !fullName || password.length < 10) return res.status(400).json({ message: 'Completa los datos. La contraseña debe tener al menos 10 caracteres.' });
  let connection;
  try {
    connection = await pool.getConnection();
    const [[lock]] = await connection.query('SELECT GET_LOCK("taller_owner_setup", 10) AS acquired');
    if (lock.acquired !== 1) throw Object.assign(new Error('No se pudo iniciar la configuración. Inténtalo de nuevo.'), { status: 503 });
    await connection.beginTransaction();
    const [[row]] = await connection.query('SELECT COUNT(*) AS total FROM users FOR UPDATE');
    if (row.total !== 0) { await connection.rollback(); return res.status(409).json({ message: 'La configuración inicial ya se completó.' }); }
    const id = await persistUser({ email, password, fullName, role: 'owner', workshopName }, connection);
    await connection.commit(); await logEvent('info', 'Propietario inicial creado', { userId: id });
    res.status(201).json({ message: 'Cuenta del propietario creada. Ya puedes iniciar sesión.' });
  } catch (e) { if (connection) await connection.rollback(); next(e); } finally { if (connection) { await connection.query('SELECT RELEASE_LOCK("taller_owner_setup")').catch(() => {}); connection.release(); } }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const [rows] = await pool.execute('SELECT id,email,password_hash,full_name,role,status FROM users WHERE email=? LIMIT 1', [email]);
    const account = rows[0];
    if (!account || account.status !== 'active' || !verifyPassword(String(req.body.password || ''), account.password_hash)) {
      await logEvent('warn', 'Intento de inicio de sesión fallido', { email, ip: req.ip });
      return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
    }
    await pool.execute('UPDATE users SET last_login_at=UTC_TIMESTAMP() WHERE id=?', [account.id]);
    const token = jwt.sign({ id: account.id, email: account.email, name: account.full_name, role: account.role }, config.jwtSecret, { expiresIn: '8h' });
    await logEvent('info', 'Inicio de sesión', { userId: account.id });
    res.json({ token, user: { id: account.id, email: account.email, fullName: account.full_name, role: account.role } });
  } catch (e) { next(e); }
});

router.get('/me', authenticate, (req, res) => res.json({ user: { id: req.user.id, email: req.user.email, fullName: req.user.name, role: req.user.role } }));

router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const [rows] = await pool.execute('SELECT id FROM users WHERE email=? AND status="active" LIMIT 1', [email]);
    const response = { message: 'Si el correo está registrado, se generó una solicitud de recuperación.' };
    if (rows[0]) {
      const token = randomBytes(32).toString('hex');
      await pool.execute('INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))', [uuidv7(), rows[0].id, hashToken(token)]);
      await logEvent('info', 'Solicitud de recuperación de contraseña', { userId: rows[0].id });
      // Integrar un proveedor de correo antes de producción; se devuelve para facilitar pruebas locales.
      if (process.env.NODE_ENV !== 'production') response.resetUrl = `${config.passwordResetBaseUrl}/?reset=${token}`;
    }
    res.json(response);
  } catch (e) { next(e); }
});

router.post('/reset-password', async (req, res, next) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 10) return res.status(400).json({ message: 'Elige una contraseña nueva de al menos 10 caracteres.' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT id,user_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE', [hashToken(token)]);
    if (!rows[0]) { await connection.rollback(); return res.status(400).json({ message: 'El enlace venció o ya fue utilizado. Solicita otro.' }); }
    await connection.execute('UPDATE users SET password_hash=? WHERE id=?', [hashPassword(password), rows[0].user_id]);
    await connection.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL', [rows[0].user_id]);
    await connection.commit(); await logEvent('info', 'Contraseña recuperada', { userId: rows[0].user_id });
    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (e) { if (connection) await connection.rollback(); next(e); } finally { connection?.release(); }
});

router.get('/users', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id,email,full_name,phone,role,status,last_login_at,created_at FROM users ORDER BY created_at DESC');
    res.json({ users: rows.map((u) => ({ id: u.id, email: u.email, fullName: u.full_name, phone: u.phone, role: u.role, status: u.status, lastLoginAt: u.last_login_at, createdAt: u.created_at })) });
  } catch (e) { next(e); }
});

router.post('/users', authenticate, requireAdmin, async (req, res, next) => {
  const { email, password, fullName, phone, role } = req.body;
  if (!email || !password || !fullName || password.length < 10) return res.status(400).json({ message: 'Completa nombre, correo y contraseña (mínimo 10 caracteres).' });
  if (!roles.includes(role)) return res.status(400).json({ message: 'Selecciona un rol válido.' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction(); const id = await persistUser({ ...req.body }, connection); await connection.commit();
    await logEvent('info', 'Usuario creado', { userId: id, role, actorId: req.user.id });
    res.status(201).json({ message: 'Usuario creado correctamente.', id });
  } catch (e) { if (connection) await connection.rollback(); next(e); } finally { connection?.release(); }
});

router.patch('/users/:id/role', authenticate, requireAdmin, async (req, res, next) => {
  const nextRole = req.body.role;
  if (!roles.includes(nextRole)) return res.status(400).json({ message: 'Selecciona un rol válido.' });
  if (req.params.id === req.user.id && !['owner', 'system'].includes(nextRole)) return res.status(400).json({ message: 'No puedes quitarte a ti mismo los permisos de administración.' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT id,email,password_hash,full_name,phone,role FROM users WHERE id=? FOR UPDATE', [req.params.id]);
    const current = rows[0];
    if (!current) { await connection.rollback(); return res.status(404).json({ message: 'No se encontró el usuario.' }); }
    if (current.role === nextRole) { await connection.rollback(); return res.json({ message: 'El usuario ya tiene ese rol.' }); }
    if (['owner', 'system'].includes(current.role) && !['owner', 'system'].includes(nextRole) && current.status === 'active') {
      const [[admins]] = await connection.query('SELECT COUNT(*) AS total FROM users WHERE role IN ("owner","system") AND status="active"');
      if (admins.total <= 1) { await connection.rollback(); return res.status(409).json({ message: 'Conserva al menos una cuenta activa de administración.' }); }
    }
    const oldProfile = UserFactory.create({ email: current.email, fullName: current.full_name, phone: current.phone, role: current.role, passwordHash: current.password_hash });
    const newProfile = UserFactory.create({ email: current.email, fullName: current.full_name, phone: current.phone, role: nextRole, passwordHash: current.password_hash });
    await connection.execute(`DELETE FROM ${oldProfile.profileTable} WHERE user_id=?`, [current.id]);
    await connection.execute('UPDATE users SET role=? WHERE id=?', [nextRole, current.id]);
    await connection.execute(`INSERT INTO ${newProfile.profileTable} (id,user_id,${newProfile.extraColumn}) VALUES (?,?,?)`, [newProfile.profileId, current.id, newProfile.extraValue({})]);
    await connection.commit();
    await logEvent('info', 'Rol de usuario actualizado', { userId: current.id, previousRole: current.role, role: nextRole, actorId: req.user.id });
    res.json({ message: 'Rol actualizado correctamente.' });
  } catch (e) { if (connection) await connection.rollback(); next(e); } finally { connection?.release(); }
});

router.patch('/users/:id/status', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!['active', 'disabled'].includes(req.body.status)) return res.status(400).json({ message: 'Estado no válido.' });
    await pool.execute('UPDATE users SET status=? WHERE id=?', [req.body.status, req.params.id]);
    await logEvent('info', 'Estado de usuario actualizado', { userId: req.params.id, status: req.body.status, actorId: req.user.id });
    res.json({ message: 'Estado actualizado.' });
  } catch (e) { next(e); }
});

export default router;
