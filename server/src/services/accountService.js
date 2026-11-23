import { pool } from '../db.js';
import { uuidv7 } from '../utils/uuidv7.js';
import { hashPassword, verifyPassword, hashToken } from '../utils/passwords.js';
import { UserFactory } from '../factories/UserFactory.js';
import { UserModel } from '../models/userModel.js';

/** Inserta un perfil concreto dentro de la transacción que asigna un rol; nombres de tabla provienen solo de UserFactory. */
async function insertProfile(connection, roleKey, userId, metadata = {}) {
  const profile = UserFactory.createProfile(roleKey, userId, metadata);
  if (!profile) return;
  const columns = ['profile_id', 'user_id', ...(profile.extraColumn ? [profile.extraColumn] : [])];
  const values = [profile.profileId, profile.userId, ...profile.extraValues];
  await connection.execute(`INSERT INTO ${profile.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
}

/** Inserta la relación usuario/rol y crea el perfil de sistema si ese rol tiene uno definido. */
export async function assignRoleInTransaction(connection, { userId, roleId, actorId = null, roleKey, metadata }) {
  const key = roleKey || (await connection.execute('SELECT role_key FROM roles WHERE role_id=? LIMIT 1', [roleId]))[0][0]?.role_key;
  if (!key) throw Object.assign(new Error('No se encontró el rol seleccionado.'), { status: 404 });
  await connection.execute('INSERT INTO user_roles (assignment_id,user_id,role_id,assigned_by) VALUES (?,?,?,?)', [uuidv7(), userId, roleId, actorId]);
  await insertProfile(connection, key, userId, metadata);
}

/** Crea una cuenta sin rol de forma predeterminada; el registro público puede solicitar la asignación inicial de cliente explícitamente. */
export async function createAccount(account, { initialRoleKey = null, actorId = null } = {}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const userId = uuidv7();
    await UserModel.insert(connection, { userId, ...account, passwordHash: await hashPassword(account.password) });
    if (initialRoleKey) {
      const [roles] = await connection.execute('SELECT role_id FROM roles WHERE role_key=? LIMIT 1', [initialRoleKey]);
      if (!roles[0]) throw Object.assign(new Error('El rol inicial no está configurado.'), { status: 500 });
      await assignRoleInTransaction(connection, { userId, roleId: roles[0].role_id, actorId, roleKey: initialRoleKey });
    }
    await connection.commit();
    return { userId, ...account, password: undefined };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

/** Autentica por usuario o correo y actualiza el último acceso solo después de verificar el hash. */
export async function authenticateAccount(identifier, password) {
  const account = await UserModel.findForLogin(identifier);
  if (!account || account.status_key !== 'active' || !(await verifyPassword(password, account.password_hash))) return null;
  await pool.execute('UPDATE users SET last_login_at=UTC_TIMESTAMP() WHERE user_id=?', [account.user_id]);
  return { id: account.user_id, username: account.username, email: account.email, firstName: account.first_name, lastName: account.last_name, phoneNumber: account.phone_number };
}

/** Crea un token impredecible con vencimiento; solo su huella SHA-512 se almacena en la base. */
export async function issueResetToken(userId, token) {
  await pool.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL', [userId]);
  await pool.execute(`INSERT INTO password_reset_tokens (reset_id,user_id,token_hash,expires_at)
    VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))`, [uuidv7(), userId, hashToken(token)]);
}

/** Consume atómicamente un token de restablecimiento y guarda un nuevo verificador de contraseña. */
export async function consumeResetToken(token, password) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(`SELECT reset_id,user_id FROM password_reset_tokens
      WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE`, [hashToken(token)]);
    if (!rows[0]) { await connection.rollback(); return false; }
    await connection.execute('UPDATE users SET password_hash=? WHERE user_id=?', [await hashPassword(password), rows[0].user_id]);
    await connection.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL', [rows[0].user_id]);
    await connection.commit();
    return true;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

/** Lee usuarios con roles agregados para que la interfaz los muestre sin poder modificar autorizaciones. */
export async function listAccounts() {
  return UserModel.listWithRoles();
}

/** Comprueba si el usuario existe antes de un cambio de estado o rol. */
export async function accountExists(userId, connection = pool) {
  const [rows] = await connection.execute('SELECT user_id FROM users WHERE user_id=? LIMIT 1', [userId]);
  return Boolean(rows[0]);
}
