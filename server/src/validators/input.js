const patterns = {
  name: /^[\p{L}][\p{L}\p{M} .'-]{0,78}[\p{L}.]$/u,
  username: /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/,
  email: /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/,
  phoneNumber: /^\+?\d{10,15}$/,
  roleName: /^[\p{L}\p{N}][\p{L}\p{M}\p{N} _-]{1,78}$/u,
  password: /^(?=.{12,128}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S+$/,
};

/**
 * Valida y normaliza datos de cuenta en servidor; repetir reglas aquí evita que una petición HTTP salte la UI.
 * @param {object} input nombre, apellidos, usuario, correo, contraseña y confirmación.
 * @param {{requirePassword?:boolean}} [options] permite edición de cuenta sin cambio de contraseña.
 * @returns {{firstName:string,lastName:string,username:string,email:string,password:string}} campos normalizados.
 * @throws {Error} HTTP 400 con `details` indexados por campo.
 */
export function validateAccount(input, { requirePassword = true } = {}) {
  const errors = {};
  const firstName = String(input.firstName || '').trim();
  const lastName = String(input.lastName || '').trim();
  const username = String(input.username || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const phoneNumber = String(input.phoneNumber || '').replace(/[ ()-]/g, '');
  const password = String(input.password || '');
  if (!patterns.name.test(firstName)) errors.firstName = 'Escribe un nombre válido.';
  if (!patterns.name.test(lastName)) errors.lastName = 'Escribe apellidos válidos.';
  if (!patterns.username.test(username)) errors.username = 'El usuario debe tener 3–32 caracteres: letras, números, punto, guion o guion bajo.';
  if (email.length > 190 || !patterns.email.test(email)) errors.email = 'Escribe un correo válido.';
  if (!patterns.phoneNumber.test(phoneNumber)) errors.phoneNumber = 'Escribe un teléfono válido de 10 a 15 dígitos.';
  if (requirePassword && !patterns.password.test(password)) errors.password = 'Usa 12–128 caracteres con mayúscula, minúscula, número y símbolo, sin espacios.';
  if (requirePassword && String(input.confirmPassword || '') !== password) errors.confirmPassword = 'Las contraseñas no coinciden.';
  if (Object.keys(errors).length) throw Object.assign(new Error('Revisa los campos marcados.'), { status: 400, details: errors });
  return { firstName, lastName, username, email, phoneNumber, password };
}

/**
 * Valida un nombre de rol y obtiene una llave ASCII estable para URL/API.
 * @param {{roleName?:string,description?:string}} input datos recibidos del formulario/API.
 * @returns {{roleName:string,roleKey:string,description:string|null}} representación normalizada para MySQL.
 * @throws {Error} HTTP 400 si nombre/longitud no cumplen las reglas.
 */
export function validateRole(input) {
  const roleName = String(input.roleName || '').trim().replace(/\s+/g, ' ');
  if (!patterns.roleName.test(roleName) || roleName.length > 80) throw Object.assign(new Error('El nombre del rol debe tener entre 2 y 80 caracteres.'), { status: 400 });
  const roleKey = roleName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  if (roleKey.length < 2) throw Object.assign(new Error('Usa un nombre de rol con letras o números.'), { status: 400 });
  return { roleName, roleKey, description: String(input.description || '').trim().slice(0, 255) || null };
}

export const validationPatterns = patterns;
