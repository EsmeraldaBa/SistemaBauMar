import { pool } from '../db.js';
import { statusIds } from '../constants/statuses.js';

/** Modelo SQL de cuentas: encapsula persistencia y lectura sin incluir reglas HTTP. */
export class UserModel {
  static async insert(connection, account) {
    return connection.execute(`INSERT INTO users (user_id,username,email,first_name,last_name,phone_number,password_hash,status_id)
      VALUES (?,?,?,?,?,?,?,?)`, [account.userId, account.username, account.email, account.firstName, account.lastName, account.phoneNumber, account.passwordHash, statusIds.active]);
  }
  static async findForLogin(identifier) {
    const [rows] = await pool.execute(`SELECT u.user_id,u.username,u.email,u.first_name,u.last_name,u.phone_number,u.password_hash,s.status_key
      FROM users u JOIN statuses s ON s.status_id=u.status_id WHERE u.username=? OR u.email=? LIMIT 1`, [identifier, identifier.toLowerCase()]);
    return rows[0] || null;
  }
  static async listWithRoles() {
    const [rows] = await pool.query(`SELECT u.user_id,u.username,u.email,u.first_name,u.last_name,u.phone_number,s.status_key AS status,u.last_login_at,u.created_at,
      COALESCE(GROUP_CONCAT(r.role_name ORDER BY r.role_name SEPARATOR ' · '),'Sin rol') AS roles
      FROM users u JOIN statuses s ON s.status_id=u.status_id LEFT JOIN user_roles ur ON ur.user_id=u.user_id LEFT JOIN roles r ON r.role_id=ur.role_id
      GROUP BY u.user_id,s.status_key ORDER BY u.created_at DESC`);
    return rows;
  }
}
