import { pool } from '../db.js';

/** Modelo SQL del catálogo; la asignación pertenece al servicio administrativo por separado. */
export class RoleModel {
  static async list() {
    const [rows] = await pool.query(`SELECT r.role_id,r.role_key,r.role_name,r.description,r.is_system,r.created_at,
      s.status_key AS status, s.status_name,
      COUNT(ur.assignment_id) AS assigned_users
      FROM roles r
      JOIN statuses s ON s.status_id = r.status_id
      LEFT JOIN user_roles ur ON ur.role_id = r.role_id
      GROUP BY r.role_id, s.status_key, s.status_name
      ORDER BY r.is_system DESC, r.role_name ASC`);
    return rows;
  }

  static async findById(roleId) {
    const [rows] = await pool.execute(`SELECT r.role_id, r.role_key, r.role_name, r.description, r.is_system, s.status_key AS status
      FROM roles r JOIN statuses s ON s.status_id = r.status_id WHERE r.role_id = ? LIMIT 1`, [roleId]);
    return rows[0] || null;
  }

  static async insert(role) {
    const [[activeStatus]] = await pool.execute(`SELECT status_id FROM statuses WHERE status_key = 'active' LIMIT 1`);
    return pool.execute('INSERT INTO roles (role_id,role_key,role_name,description,is_system,status_id) VALUES (?,?,?,?,FALSE,?)',
      [role.roleId, role.roleKey, role.roleName, role.description, activeStatus.status_id]);
  }

  static async updateName(roleId, { roleName, description }) {
    const role = await this.findById(roleId);
    if (!role) throw Object.assign(new Error('No se encontró el rol solicitado.'), { status: 404 });
    if (role.is_system) throw Object.assign(new Error('Los roles de sistema no pueden ser renombrados.'), { status: 400 });

    const cleanName = String(roleName || '').trim();
    if (!cleanName || cleanName.length < 2 || cleanName.length > 80) {
      throw Object.assign(new Error('Escribe un nombre de rol válido de 2 a 80 caracteres.'), { status: 400 });
    }

    const [[existingName]] = await pool.execute('SELECT role_id FROM roles WHERE role_name = ? AND role_id <> ? LIMIT 1', [cleanName, roleId]);
    if (existingName) throw Object.assign(new Error('Ya existe otro rol con ese mismo nombre.'), { status: 409 });

    await pool.execute('UPDATE roles SET role_name = ?, description = ? WHERE role_id = ?',
      [cleanName, description ? String(description).trim() : role.description, roleId]);
    return { roleId, roleName: cleanName };
  }

  static async updateStatus(roleId, statusKey) {
    const role = await this.findById(roleId);
    if (!role) throw Object.assign(new Error('No se encontró el rol solicitado.'), { status: 404 });
    if (role.is_system) throw Object.assign(new Error('Los roles de sistema no pueden ser suspendidos ni desactivados.'), { status: 400 });
    if (!['active', 'suspended'].includes(statusKey)) {
      throw Object.assign(new Error('El estado debe ser Activo o Suspendido.'), { status: 400 });
    }

    const [[catalogStatus]] = await pool.execute('SELECT status_id FROM statuses WHERE status_key = ? LIMIT 1', [statusKey]);
    if (!catalogStatus) throw Object.assign(new Error('Estado de catálogo no válido.'), { status: 400 });

    await pool.execute('UPDATE roles SET status_id = ? WHERE role_id = ?', [catalogStatus.status_id, roleId]);
    return { roleId, status: statusKey };
  }
}
