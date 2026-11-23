import { randomBytes, pbkdf2, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(pbkdf2);
const ITERATIONS = 310_000;
const KEY_LENGTH = 64;

/** Deriva un verificador PBKDF2-HMAC-SHA-512 con salt único; resuelve cuando termina el cómputo. */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await deriveKey(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
  return `pbkdf2-sha512$${ITERATIONS}$${salt}$${derived.toString('hex')}`;
}

/** Compara de forma resistente a diferencias temporales y admite únicamente el formato esperado. */
export async function verifyPassword(password, encoded) {
  const [algorithm, rounds, salt, expected] = String(encoded).split('$');
  if (algorithm !== 'pbkdf2-sha512' || !/^\d{6,}$/.test(rounds || '') || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const actual = await deriveKey(password, salt, Number(rounds), KEY_LENGTH, 'sha512');
  const expectedBytes = Buffer.from(expected, 'hex');
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

/** Calcula SHA-512 de tokens opacos para guardar únicamente su huella en MySQL. */
export const hashToken = (token) => createHash('sha512').update(token).digest('hex');
