import { randomBytes } from 'node:crypto';

/**
 * Genera una llave temporalmente ordenable conforme al formato UUIDv7.
 * @returns {string} UUID canónico de 36 caracteres.
 * @throws {Error} si el generador criptográfico de Node no está disponible.
 */
export function uuidv7() {
  const bytes = randomBytes(16);
  let timestamp = BigInt(Date.now());
  for (let i = 5; i >= 0; i -= 1) { bytes[i] = Number(timestamp & 0xffn); timestamp >>= 8n; }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
