export const patterns = {
  name: /^[\p{L}][\p{L}\p{M} .'-]{0,78}[\p{L}.]$/u,
  username: /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/,
  email: /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/,
  phoneNumber: /^\+?\d[\d ()-]{8,18}\d$/,
  password: /^(?=.{12,128}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S+$/,
  roleName: /^[\p{L}\p{N}][\p{L}\p{M}\p{N} _-]{1,78}$/u,
};

/** Ejecuta las mismas reglas visibles en frontend para feedback inmediato; el backend vuelve a validarlas por seguridad. */
export function validate(values, { passwordRequired = true, role = false } = {}) {
  const errors = {};
  if (values.firstName !== undefined && !patterns.name.test(values.firstName.trim())) errors.firstName = 'Escribe un nombre válido.';
  if (values.lastName !== undefined && !patterns.name.test(values.lastName.trim())) errors.lastName = 'Escribe apellidos válidos.';
  if (values.username !== undefined && !patterns.username.test(values.username.trim())) errors.username = 'Usa 3–32 letras, números, punto, guion o guion bajo.';
  if (values.email !== undefined && (values.email.length > 190 || !patterns.email.test(values.email.trim()))) errors.email = 'Escribe un correo válido.';
  if (values.phoneNumber !== undefined && !/^\+?\d{10,15}$/.test(values.phoneNumber.replace(/[ ()-]/g, ''))) errors.phoneNumber = 'Escribe un teléfono válido de 10 a 15 dígitos.';
  if (passwordRequired && values.password !== undefined && !patterns.password.test(values.password)) errors.password = 'Usa 12–128 caracteres con mayúscula, minúscula, número y símbolo.';
  if (values.confirmPassword !== undefined && values.password !== values.confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden.';
  if (role && (!patterns.roleName.test((values.roleName || '').trim()) || (values.roleName || '').trim().length > 80)) errors.roleName = 'Escribe un nombre de rol de 2–80 caracteres.';
  return errors;
}
