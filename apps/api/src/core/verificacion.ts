/**
 * Verificación de mail con un código de 6 números, para trámites sin cuenta. Prueba que la
 * persona tiene acceso a esa casilla, que es adonde le van a llegar los avisos.
 *
 * Resguardos: el código vence a los 15 minutos, admite 5 intentos, se guarda solo su hash y
 * hay un tope de pedidos por mail y por IP para que no se use para mandar mails a terceros.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { pool } from '../db.js';

const VIGENCIA_MINUTOS = 15;
const MAX_INTENTOS = 5;
const MAX_POR_EMAIL_HORA = 5;
const MAX_POR_IP_HORA = 20;

export const normalizarEmail = (email: string) => email.trim().toLowerCase();
export const emailValido = (email: string) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) && email.length <= 254;

const hash = (id: string, codigo: string) => createHash('sha256').update(`${id}:${codigo}`).digest('hex');

export type ResultadoPedido = { ok: true; codigo: string } | { ok: false; motivo: 'limite' };

/** Genera un código nuevo. Devuelve el código para mandarlo por mail; no se guarda en claro. */
export async function pedirCodigo(email: string, proposito: string, ip: string): Promise<ResultadoPedido> {
  const { rows } = await pool.query<{ por_email: string; por_ip: string }>(
    `select count(*) filter (where email = $1) as por_email, count(*) filter (where ip = $2) as por_ip
       from pagos.verificaciones_email where created_at > now() - interval '1 hour'`,
    [email, ip],
  );
  if (Number(rows[0].por_email) >= MAX_POR_EMAIL_HORA || Number(rows[0].por_ip) >= MAX_POR_IP_HORA) return { ok: false, motivo: 'limite' };

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { rows: insertadas } = await pool.query<{ id: string }>(
    `insert into pagos.verificaciones_email (email, proposito, codigo_hash, expira_en, ip)
     values ($1, $2, '', now() + make_interval(mins => $3), $4) returning id`,
    [email, proposito, VIGENCIA_MINUTOS, ip],
  );
  const id = insertadas[0].id;
  await pool.query('update pagos.verificaciones_email set codigo_hash = $1 where id = $2', [hash(id, codigo), id]);
  return { ok: true, codigo };
}

/** Verifica y consume el código. Solo vale el último pedido vigente para ese mail y propósito. */
export async function verificarCodigo(email: string, proposito: string, codigo: string): Promise<boolean> {
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
  await pool.query(
    ok
      ? 'update pagos.verificaciones_email set usado_en = now() where id = $1'
      : 'update pagos.verificaciones_email set intentos = intentos + 1 where id = $1',
    [v.id],
  );
  return ok;
}
