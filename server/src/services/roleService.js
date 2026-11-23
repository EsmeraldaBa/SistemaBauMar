import { pool } from '../db.js';
import { uuidv7 } from '../utils/uuidv7.js';
import { assignRoleInTransaction, accountExists } from './accountService.js';
import { RoleModel } from '../models/roleModel.js';

/** Lista el catálogo de roles separado de sus asignaciones a usuarios. */
export async function listRoles() {
  return RoleModel.list();
}

/** Inserta únicamente el catálogo; este método jamás inserta en user_roles. */
export async function createRole(role) {
  const roleId = uuidv7();
  await RoleModel.insert({ roleId, ...role });
  return { roleId, ...role };
}

/** Actualiza nombre y descripción de roles personalizados. */
export async function updateRole(roleId, data) {
  return RoleModel.updateName(roleId, data);
}

/** Cambia el estatus de un rol en base de datos (activo o suspendido), protegiendo roles de sistema. */
export async function setRoleStatus(roleId, statusKey) {
  return RoleModel.updateStatus(roleId, statusKey);
}

/** Asigna un rol en transacción; el Factory Method crea un perfil concreto para los roles de sistema compatibles. */
export async function assignRole({ userId, roleId, actorId }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (!(await accountExists(userId, connection))) throw Object.assign(new Error('No se encontró el usuario.'), { status: 404 });
    await assignRoleInTransaction(connection, { userId, roleId, actorId });
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

/** Retira una asignación, conservando al último administrador activo para evitar bloquear el sistema. */
export async function removeRoleAssignment(assignmentId, actorId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(`SELECT ur.assignment_id,ur.user_id,r.role_key FROM user_roles ur
      JOIN roles r ON r.role_id=ur.role_id WHERE ur.assignment_id=? FOR UPDATE`, [assignmentId]);
    const assignment = rows[0];
    if (!assignment) throw Object.assign(new Error('No se encontró la asignación.'), { status: 404 });
    if (assignment.role_key === 'administrator') {
      const [[count]] = await connection.query(`SELECT COUNT(*) AS total FROM user_roles ur JOIN roles r ON r.role_id=ur.role_id
        JOIN users u ON u.user_id=ur.user_id JOIN statuses s ON s.status_id=u.status_id WHERE r.role_key='administrator' AND s.status_key='active'`);
      if (count.total <= 1) throw Object.assign(new Error('Conserva al menos una cuenta administradora activa.'), { status: 409 });
    }
    await connection.execute('DELETE FROM user_roles WHERE assignment_id=?', [assignmentId]);
    const profileTable = ({ administrator: 'owner_profiles', receptionist: 'receptionist_profiles', service_advisor: 'advisor_profiles', technician: 'technician_profiles', customer: 'customer_profiles', system: 'system_profiles' })[assignment.role_key];
    if (profileTable) await connection.execute(`DELETE FROM ${profileTable} WHERE user_id=?`, [assignment.user_id]);
    await connection.commit();
    return { assignmentId, actorId };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

/** Lista asignaciones mostrando usuario, rol y administrador que concedió el permiso. */
export async function listRoleAssignments() {
  const [rows] = await pool.query(`SELECT ur.assignment_id,ur.user_id,ur.role_id,ur.assigned_at,
      u.username,u.email,u.first_name,u.last_name,r.role_name,r.role_key,
      actor.username AS assigned_by_username
    FROM user_roles ur JOIN users u ON u.user_id=ur.user_id JOIN roles r ON r.role_id=ur.role_id
    LEFT JOIN users actor ON actor.user_id=ur.assigned_by ORDER BY ur.assigned_at DESC`);
  return rows;
}
