/**
 * Verificación de mail con un código de 6 números, para trámites sin cuenta. Prueba que la
 * persona tiene acceso a esa casilla, que es adonde le van a llegar los avisos.
 *
 * Resguardos: el código vence a los 15 minutos, admite 5 intentos, se guarda solo su HMAC (con un
 * secreto del servidor: un hash simple de 6 dígitos se revierte al instante) y hay un tope de pedidos
 * por casilla y por IP para que no se use para mandar mails a terceros. Si se pidió un código hace
 * menos de 1 minuto no se genera otro: así nadie puede anular el código que la persona está escribiendo.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { pool } from '../db.js';

const VIGENCIA_MINUTOS = 15;
const REENVIO_SEGUNDOS = 60;
const MAX_INTENTOS = 5;
const MAX_POR_EMAIL_HORA = 5;
const MAX_POR_IP_HORA = 20;

export const normalizarEmail = (email: string) => email.trim().toLowerCase();
export const emailValido = (email: string) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) && email.length <= 254;

/**
 * Casilla "canónica", solo para contar pedidos: sin `+etiqueta` y, en Gmail, sin puntos. Las variantes
 * de una misma casilla comparten tope. La identidad de la solicitud sigue siendo el mail exacto.
 */
export function emailCanonico(email: string): string {
  const [local = '', dominio = ''] = normalizarEmail(email).split('@');
  const sinEtiqueta = local.split('+')[0];
  if (dominio === 'gmail.com' || dominio === 'googlemail.com') return `${sinEtiqueta.replace(/\./g, '')}@gmail.com`;
  return `${sinEtiqueta}@${dominio}`;
}

const SECRETO_DESARROLLO = 'desarrollo-sin-secreto-no-usar-en-produccion';
function secreto(): string {
  const s = (process.env.VERIFICACION_SECRETO ?? '').trim();
  if (s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('Falta VERIFICACION_SECRETO en el .env (al menos 32 caracteres: openssl rand -base64 48).');
  return SECRETO_DESARROLLO;
}
/** Falla al arrancar en producción si falta el secreto de los códigos. */
export const exigirSecretoDeCodigos = () => void secreto();

const hash = (id: string, codigo: string) => createHmac('sha256', secreto()).update(`${id}:${codigo}`).digest('hex');

/** `codigo: null` = se pidió uno hace menos de 1 minuto: sigue vigente y no se manda otro. */
export type ResultadoPedido = { ok: true; codigo: string | null } | { ok: false; motivo: 'limite' };

/** Genera un código nuevo. Devuelve el código para mandarlo por mail; no se guarda en claro. */
export async function pedirCodigo(email: string, proposito: string, ip: string): Promise<ResultadoPedido> {
  const canonico = emailCanonico(email);
  const reciente = await pool.query(
    `select 1 from pagos.verificaciones_email
      where email = $1 and proposito = $2 and usado_en is null and created_at > now() - make_interval(secs => $3)`,
    [email, proposito, REENVIO_SEGUNDOS],
  );
  if (reciente.rowCount) return { ok: true, codigo: null };
  const { rows } = await pool.query<{ por_email: string; por_ip: string }>(
    `select count(*) filter (where email_canonico = $1) as por_email, count(*) filter (where ip = $2) as por_ip
       from pagos.verificaciones_email where created_at > now() - interval '1 hour'`,
    [canonico, ip],
  );
  if (Number(rows[0].por_email) >= MAX_POR_EMAIL_HORA || Number(rows[0].por_ip) >= MAX_POR_IP_HORA) return { ok: false, motivo: 'limite' };

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { rows: insertadas } = await pool.query<{ id: string }>(
    `insert into pagos.verificaciones_email (email, proposito, codigo_hash, expira_en, ip, email_canonico)
     values ($1, $2, '', now() + make_interval(mins => $3), $4, $5) returning id`,
    [email, proposito, VIGENCIA_MINUTOS, ip, canonico],
  );
  const id = insertadas[0].id;
  await pool.query('update pagos.verificaciones_email set codigo_hash = $1 where id = $2', [hash(id, codigo), id]);
  return { ok: true, codigo };
}

/**
 * Verifica el código y, por defecto, lo consume. Solo vale el último pedido vigente para ese mail
 * y propósito. Con `consumir: false` lo comprueba pero sigue vigente (ej. para mostrar algo antes
 * de seguir); un código equivocado cuenta como intento igual.
 */
export async function verificarCodigo(email: string, proposito: string, codigo: string, { consumir = true } = {}): Promise<boolean> {
  if (!/^\d{6}$/.test(codigo)) return false;
  const { rows } = await pool.query<{ id: string; codigo_hash: string; intentos: number }>(
    `select id, codigo_hash, intentos from pagos.verificaciones_email
      where email = $1 and proposito = $2 and usado_en is null and expira_en > now()
      order by created_at desc limit 1`,
    [email, proposito],
  );
  const v = rows[0];
  if (!v || v.intentos >= MAX_INTENTOS) return false;
  const esperado = Buffer.from(v.codigo_hash, 'hex');
  const recibido = Buffer.from(hash(v.id, codigo), 'hex');
  const ok = esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
  if (ok && !consumir) return true;
  await pool.query(
    ok
      ? 'update pagos.verificaciones_email set usado_en = now() where id = $1'
      : 'update pagos.verificaciones_email set intentos = intentos + 1 where id = $1',
    [v.id],
  );
  return ok;
}
