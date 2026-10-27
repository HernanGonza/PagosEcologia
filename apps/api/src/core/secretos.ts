/**
 * Cifrado de valores que hay que poder recuperar (ej. el enlace privado de una solicitud, para
 * mandarlo en los avisos), con AES-256-GCM y la clave SOLICITUDES_SECRETO del .env de la API.
 * Si esa clave cambia, los valores cifrados antes dejan de poder leerse.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function clave(): Buffer {
  const secreto = (process.env.SOLICITUDES_SECRETO ?? '').trim();
  if (secreto.length < 32) throw new Error('Falta SOLICITUDES_SECRETO en el .env (al menos 32 caracteres; ver .env.example).');
  return createHash('sha256').update(secreto).digest();
}

/** Devuelve `iv.tag.cifrado` en base64url. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', clave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), cifrado].map((b) => b.toString('base64url')).join('.');
}

export function descifrar(valor: string): string {
  const [iv, tag, cifrado] = valor.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', clave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
}
