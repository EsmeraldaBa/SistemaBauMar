import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { uuidv7 } from '../utils/uuidv7.js';
import { hashPassword } from '../utils/passwords.js';
import { validateAccount, validationPatterns } from '../validators/input.js';
import { assignRoleInTransaction, authenticateAccount, createAccount, consumeResetToken, issueResetToken } from '../services/accountService.js';
import { logEvent } from '../utils/logger.js';
import { statusIds } from '../constants/statuses.js';

/** Informa si debe aparecer la creación inicial de la cuenta administradora. */
export async function setupStatus(_req, res) {
  const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM user_roles ur
    JOIN roles r ON r.role_id=ur.role_id WHERE r.role_key='administrator'`);
  res.json({ needsAdministrator: Number(row.total) === 0 });
}

/** Crea en forma atómica la primera cuenta y su rol de administración; la creación se bloquea una vez que existe una cuenta. */
export async function setupAdministrator(req, res) {
  const account = validateAccount(req.body);
  const connection = await pool.getConnection();
  let lockAcquired = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('baumar_initial_admin',10) AS acquired");
    lockAcquired = lock.acquired === 1;
    if (!lockAcquired) throw Object.assign(new Error('No se pudo iniciar la configuración. Inténtalo de nuevo.'), { status: 503 });
    await connection.beginTransaction();
    const [[count]] = await connection.query(`SELECT COUNT(*) AS total FROM user_roles ur
      JOIN roles r ON r.role_id=ur.role_id WHERE r.role_key='administrator'`);
    if (Number(count.total) > 0) throw Object.assign(new Error('La cuenta administradora inicial ya fue creada.'), { status: 409 });
    const userId = uuidv7();
    await connection.execute(`INSERT INTO users (user_id,username,email,first_name,last_name,phone_number,password_hash,status_id)
      VALUES (?,?,?,?,?,?,?,?)`, [userId, account.username, account.email, account.firstName, account.lastName, account.phoneNumber, await hashPassword(account.password), statusIds.active]);
    const [roles] = await connection.execute("SELECT role_id FROM roles WHERE role_key='administrator' LIMIT 1");
    if (!roles[0]) throw Object.assign(new Error('No se encontró el rol administrador en el catálogo.'), { status: 500 });
    await assignRoleInTransaction(connection, { userId, roleId: roles[0].role_id, actorId: userId, roleKey: 'administrator' });
    await connection.commit();
    await logEvent('info', 'Cuenta administradora inicial creada', { module: 'auth', userId, requestId: req.requestId });
    res.status(201).json({ message: 'Cuenta de administración creada. Ya puedes iniciar sesión.' });
  } catch (error) { await connection.rollback(); throw error; }
  finally { if (lockAcquired) await connection.query("SELECT RELEASE_LOCK('baumar_initial_admin')").catch(() => {}); connection.release(); }
}

/** Registra una cuenta pública de cliente; la asignación de cliente es una política explícita de registro, no una consecuencia de crear un rol. */
export async function register(req, res) {
  const account = validateAccount(req.body);
  const created = await createAccount(account, { initialRoleKey: 'customer' });
  // Enlaza el primer perfil de cliente pendiente con ese correo; la restricción UNIQUE evita asociar una cuenta a varios perfiles.
  const [[customer]] = await pool.execute('SELECT customer_id FROM customers WHERE email=? AND user_id IS NULL ORDER BY created_at LIMIT 1', [created.email]);
  if (customer) await pool.execute('UPDATE customers SET user_id=? WHERE customer_id=? AND user_id IS NULL', [created.userId, customer.customer_id]);
  await logEvent('info', 'Cuenta de cliente registrada', { module: 'auth', userId: created.userId, requestId: req.requestId });
  res.status(201).json({ message: 'Cuenta creada. Ya puedes iniciar sesión.' });
}

/** Valida usuario/correo y contraseña; nunca devuelve el hash y registra solo el identificador intentado. */
export async function login(req, res) {
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');
  if (!identifier || identifier.length > 190 || !password || password.length > 128) throw Object.assign(new Error('Escribe tu usuario o correo y contraseña.'), { status: 400 });
  const account = await authenticateAccount(identifier, password);
  if (!account) {
    await logEvent('warn', 'Credenciales de acceso rechazadas', { module: 'auth', identifier: identifier.slice(0, 190), requestId: req.requestId, ip: req.ip });
    throw Object.assign(new Error('Usuario o contraseña incorrectos.'), { status: 401 });
  }
  const token = jwt.sign({ sub: account.id }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '8h', issuer: 'baumar-api', audience: 'baumar-web' });
  await logEvent('info', 'Inicio de sesión correcto', { module: 'auth', userId: account.id, requestId: req.requestId });
  res.json({ token, user: { ...account } });
}

/** Devuelve los datos mínimos del usuario autenticado y los roles leídos desde MySQL en el middleware. */
export function me(req, res) { res.json({ user: req.auth }); }

/** Emite un token de restablecimiento de un solo uso sin revelar si la cuenta existe, buscando por correo o teléfono. */
export async function forgotPassword(req, res) {
  if (!config.emailEnabled) {
    return res.json({ message: 'La recuperación por correo está deshabilitada en este despliegue. Contacta al administrador del taller.' });
  }
  const target = String(req.body.identifier || req.body.email || req.body.phoneNumber || '').trim();
  if (!target) throw Object.assign(new Error('Escribe tu correo electrónico o número de teléfono.'), { status: 400 });

  const isEmail = validationPatterns.email.test(target) && target.length <= 190;
  const cleanPhone = target.replace(/[ ()-]/g, '');
  const isPhone = validationPatterns.phoneNumber.test(cleanPhone);
  // Sin correo configurado, el nombre de usuario permite probar el restablecimiento desde esta máquina.
  // Esta vía solo se habilita cuando el entorno local expone enlaces de desarrollo.
  const localRecoveryEnabled = process.env.NODE_ENV !== 'production' && config.exposeResetToken;
  const isLocalUsername = localRecoveryEnabled && validationPatterns.username.test(target);

  if (!isEmail && !isPhone && !isLocalUsername) {
    throw Object.assign(new Error('Escribe un correo válido, un teléfono de 10 a 15 dígitos o, en modo local, tu nombre de usuario.'), { status: 400 });
  }

  let rows = [];
  if (isEmail) {
    [rows] = await pool.execute(
      "SELECT u.user_id, u.email, u.phone_number FROM users u JOIN statuses s ON s.status_id=u.status_id WHERE u.email=? AND s.status_key='active' LIMIT 1",
      [target.toLowerCase()]
    );
  } else if (isPhone) {
    const phoneCandidates = [target, cleanPhone];
    if (cleanPhone.startsWith('+')) {
      phoneCandidates.push(cleanPhone.slice(1));
    } else {
      phoneCandidates.push(`+${cleanPhone}`);
      if (cleanPhone.length === 10) {
        phoneCandidates.push(`+52${cleanPhone}`);
        phoneCandidates.push(`52${cleanPhone}`);
      }
    }
    const uniqueCandidates = [...new Set(phoneCandidates)];
    const placeholders = uniqueCandidates.map(() => '?').join(',');
    [rows] = await pool.execute(
      `SELECT u.user_id, u.email, u.phone_number FROM users u JOIN statuses s ON s.status_id=u.status_id
       WHERE (
         u.phone_number IN (${placeholders}) OR
         REPLACE(REPLACE(REPLACE(REPLACE(u.phone_number, ' ', ''), '-', ''), '(', ''), ')', '') IN (${placeholders})
       ) AND s.status_key='active' LIMIT 1`,
      [...uniqueCandidates, ...uniqueCandidates]
    );
  } else if (isLocalUsername) {
    [rows] = await pool.execute(
      "SELECT u.user_id, u.email, u.phone_number FROM users u JOIN statuses s ON s.status_id=u.status_id WHERE u.username=? AND s.status_key='active' LIMIT 1",
      [target]
    );
  }

  const result = {
    message: isEmail
      ? 'Si el correo pertenece a una cuenta activa, recibirás instrucciones para recuperar el acceso.'
      : isPhone
        ? 'Si el teléfono pertenece a una cuenta activa, recibirás instrucciones para recuperar el acceso.'
        : 'Si el usuario pertenece a una cuenta activa, recibirás instrucciones para recuperar el acceso.',
  };

  if (localRecoveryEnabled) {
    result.localRecoveryMessage = rows[0]
      ? 'Cuenta encontrada. En modo local no se envía correo: usa el botón de abajo para abrir el restablecimiento.'
      : 'No se encontró una cuenta activa con esos datos. Prueba el correo, teléfono o nombre de usuario exactamente como se registró.';
  }

  if (rows[0]) {
    const token = randomBytes(32).toString('hex');
    await issueResetToken(rows[0].user_id, token);
    await logEvent('info', 'Recuperación de contraseña solicitada', {
      module: 'auth',
      userId: rows[0].user_id,
      via: isEmail ? 'email' : 'phone',
      requestId: req.requestId,
    });
    if (localRecoveryEnabled) {
      result.resetUrl = `${config.passwordResetBaseUrl}/?reset=${token}`;
      result.resetToken = token;
    }
  }
  res.json(result);
}

/** Verifica formato y vencimiento del token y cambia el verificador de contraseña sin guardar secretos en logs. */
export async function resetPassword(req, res) {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error('El enlace de recuperación no es válido.'), { status: 400 });
  if (!validationPatterns.password.test(password)) throw Object.assign(new Error('La contraseña no cumple con los requisitos de seguridad.'), { status: 400 });
  if (String(req.body.confirmPassword || '') !== password) throw Object.assign(new Error('Las contraseñas no coinciden.'), { status: 400 });
  if (!(await consumeResetToken(token, password))) throw Object.assign(new Error('El enlace venció o ya fue utilizado. Solicita uno nuevo.'), { status: 400 });
  await logEvent('info', 'Contraseña actualizada mediante recuperación', { module: 'auth', requestId: req.requestId });
  res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
}
