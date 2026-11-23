import { pool } from '../db.js';
import { listAccounts } from '../services/accountService.js';
import { assignRole, createRole, listRoleAssignments, listRoles, removeRoleAssignment, updateRole, setRoleStatus } from '../services/roleService.js';
import { validateAccount, validateRole } from '../validators/input.js';
import { logEvent } from '../utils/logger.js';
import { uuidv7 } from '../utils/uuidv7.js';
import { hashPassword } from '../utils/passwords.js';
import { statusIds } from '../constants/statuses.js';
import { performanceAnalystAgent } from '../agents/PerformanceAnalystAgent.js';

/** Expone métricas técnicas agregadas únicamente a administradores autenticados. */
export function getPerformanceReport(_req, res) {
  res.json({ report: performanceAnalystAgent.snapshot() });
}

/** Recibe tiempos de render del navegador, con vista permitida y duración acotada; nunca recibe datos del taller. */
export function recordPerformancePage(req, res) {
  const { view, durationMs } = req.body || {};
  if (!performanceAnalystAgent.recordPageView(view, durationMs)) throw Object.assign(new Error('La medición de pantalla no es válida.'), { status: 400 });
  res.status(202).json({ message: 'Medición de rendimiento recibida.' });
}

/** Devuelve la tabla de cuentas con los roles actuales para el módulo de usuarios. */
export async function getUsers(req, res) {
  const users = await listAccounts();
  const isAdmin = req.auth.roles.includes('administrator');
  res.json({ users: users.map((user) => ({ userId: user.user_id, username: user.username, ...(isAdmin ? { email: user.email, phoneNumber: user.phone_number } : {}), firstName: user.first_name, lastName: user.last_name, status: user.status, roles: user.roles, lastLoginAt: user.last_login_at, createdAt: user.created_at })) });
}

/** Da de alta una cuenta sin asignarle rol; un administrador concede roles en el módulo independiente de administración de roles. */
export async function postUser(req, res) {
  const account = validateAccount(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const userId = uuidv7();
    await connection.execute('INSERT INTO users (user_id,username,email,first_name,last_name,phone_number,password_hash,status_id) VALUES (?,?,?,?,?,?,?,?)', [userId, account.username, account.email, account.firstName, account.lastName, account.phoneNumber, await hashPassword(account.password), statusIds.active]);
    await connection.commit();
    await logEvent('info', 'Cuenta creada por administración', { module: 'users', userId, actorId: req.auth.id, requestId: req.requestId });
    res.status(201).json({ message: 'Usuario creado sin asignación de rol.', userId });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

/** Edita identidad y datos de acceso de una cuenta; la edición no permite cambiar roles. */
export async function patchUser(req, res) {
  const account = validateAccount(req.body, { requirePassword: Boolean(req.body.password) });
  if (req.body.password && req.body.password !== req.body.confirmPassword) throw Object.assign(new Error('Las contraseñas no coinciden.'), { status: 400 });
  const [existing] = await pool.execute('SELECT user_id FROM users WHERE user_id=? LIMIT 1', [req.params.userId]);
  if (!existing[0]) throw Object.assign(new Error('No se encontró el usuario.'), { status: 404 });
  if (req.body.password) {
    await pool.execute('UPDATE users SET username=?,email=?,first_name=?,last_name=?,phone_number=?,password_hash=? WHERE user_id=?', [account.username, account.email, account.firstName, account.lastName, account.phoneNumber, await hashPassword(req.body.password), req.params.userId]);
  } else await pool.execute('UPDATE users SET username=?,email=?,first_name=?,last_name=?,phone_number=? WHERE user_id=?', [account.username, account.email, account.firstName, account.lastName, account.phoneNumber, req.params.userId]);
  await logEvent('info', 'Datos de usuario actualizados', { module: 'users', userId: req.params.userId, actorId: req.auth.id, requestId: req.requestId });
  res.json({ message: 'Usuario actualizado.' });
}

/** Activa o desactiva una cuenta y bloquea que el administrador desactive su propia sesión de privilegios. */
export async function patchUserStatus(req, res) {
  const status = req.body.status;
  if (!['active', 'inactive', 'deleted'].includes(status)) throw Object.assign(new Error('Selecciona un estado válido.'), { status: 400 });
  if (req.params.userId === req.auth.id && status !== 'active') throw Object.assign(new Error('No puedes desactivar ni eliminar tu propia cuenta administradora.'), { status: 400 });
  if (status !== 'active') {
    const [[target]] = await pool.execute(`SELECT COUNT(*) AS is_admin FROM user_roles ur JOIN roles r ON r.role_id=ur.role_id
      WHERE ur.user_id=? AND r.role_key='administrator'`, [req.params.userId]);
    if (Number(target.is_admin) > 0) {
      const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM user_roles ur JOIN roles r ON r.role_id=ur.role_id
        JOIN users u ON u.user_id=ur.user_id JOIN statuses s ON s.status_id=u.status_id WHERE r.role_key='administrator' AND s.status_key='active'`);
      if (Number(count.total) <= 1) throw Object.assign(new Error('Conserva al menos una cuenta administradora activa.'), { status: 409 });
    }
  }
  const [result] = await pool.execute('UPDATE users SET status_id=? WHERE user_id=?', [statusIds[status], req.params.userId]);
  if (!result.affectedRows) throw Object.assign(new Error('No se encontró el usuario.'), { status: 404 });
  await logEvent('info', 'Estado de usuario actualizado', { module: 'users', userId: req.params.userId, actorId: req.auth.id, status, requestId: req.requestId });
  res.json({ message: `Cuenta ${status === 'active' ? 'activada' : 'desactivada'}.` });
}

/** Consulta roles disponibles sin alterar las asignaciones. */
export async function getRoles(_req, res) {
  const roles = await listRoles();
  res.json({
    roles: roles.map((role) => ({
      roleId: role.role_id,
      roleKey: role.role_key,
      roleName: role.role_name,
      description: role.description,
      isSystem: Boolean(role.is_system),
      status: role.status || 'active',
      statusName: role.status_name || 'Activo',
      assignedUsers: Number(role.assigned_users)
    }))
  });
}

/** Valida y crea únicamente un rol de catálogo, sin asignarlo a usuario alguno. */
export async function postRole(req, res) {
  const role = validateRole(req.body);
  const created = await createRole(role);
  await logEvent('info', 'Rol creado en catálogo', { module: 'roles', roleId: created.roleId, actorId: req.auth.id, requestId: req.requestId });
  res.status(201).json({ message: 'Rol creado. Aún no está asignado a ningún usuario.', role: created });
}

/** Actualiza nombre o descripción de roles personalizados. */
export async function patchRole(req, res) {
  const updated = await updateRole(req.params.roleId, { roleName: req.body.roleName, description: req.body.description });
  await logEvent('info', 'Rol actualizado', { module: 'roles', roleId: req.params.roleId, actorId: req.auth.id, requestId: req.requestId });
  res.json({ message: 'Nombre del rol actualizado correctamente.', role: updated });
}

/** Cambia el estatus de un rol en base de datos (activo o suspendido), protegiendo roles de sistema. */
export async function patchRoleStatus(req, res) {
  const status = String(req.body.status || '');
  const updated = await setRoleStatus(req.params.roleId, status);
  await logEvent('info', 'Estado de rol actualizado', { module: 'roles', roleId: req.params.roleId, actorId: req.auth.id, status, requestId: req.requestId });
  res.json({ message: `Rol marcado como ${status === 'active' ? 'Activo' : 'Suspendido'} en base de datos.`, role: updated });
}

/** Valida IDs UUID, revisa destinatario/rol y delega la concesión transaccional. */
export async function postRoleAssignment(req, res) {
  const { userId, roleId } = req.body;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(userId || '') || !uuid.test(roleId || '')) throw Object.assign(new Error('Selecciona un usuario y rol válidos.'), { status: 400 });
  if (userId === req.auth.id && !req.auth.roles.includes('administrator')) throw Object.assign(new Error('No tienes permisos para asignar roles.'), { status: 403 });
  await assignRole({ userId, roleId, actorId: req.auth.id });
  await logEvent('info', 'Rol asignado', { module: 'role-administration', userId, roleId, actorId: req.auth.id, requestId: req.requestId });
  res.status(201).json({ message: 'Rol asignado correctamente.' });
}

/** Retira solo la asignación indicada, no elimina el registro del catálogo de roles. */
export async function deleteRoleAssignment(req, res) {
  await removeRoleAssignment(req.params.assignmentId, req.auth.id);
  await logEvent('info', 'Asignación de rol retirada', { module: 'role-administration', assignmentId: req.params.assignmentId, actorId: req.auth.id, requestId: req.requestId });
  res.json({ message: 'Asignación retirada.' });
}

/** Lista relaciones vigentes para la pantalla exclusiva de administración de roles. */
export async function getRoleAssignments(_req, res) {
  const assignments = await listRoleAssignments();
  res.json({ assignments: assignments.map((item) => ({ assignmentId: item.assignment_id, userId: item.user_id, roleId: item.role_id, assignedAt: item.assigned_at, username: item.username, email: item.email, firstName: item.first_name, lastName: item.last_name, roleName: item.role_name, roleKey: item.role_key, assignedByUsername: item.assigned_by_username })) });
}

/** Punto de extensión para futuros clientes; este endpoint deliberadamente no contiene CRUD ni datos. */
export function clientsPlaceholder(_req, res) { res.json({ ready: false, clients: [], message: 'El módulo de clientes está preparado para una fase futura.' }); }
