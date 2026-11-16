/**
 * Pago online (Click de Pago, modalidad formulario): crear la orden, armar el formulario y procesar el aviso del banco.
 *
 * REGLA DE SEGURIDAD: el aviso del banco no trae firma, así que NUNCA se cree su cuerpo. Solo sirve para saber
 * QUÉ orden mirar; si está pagada lo decide `confirmador` (por defecto, una consulta al banco con las credenciales
 * de la cuenta que exige estado REALIZADA y el monto exacto de nuestra orden). Si la consulta falla o no se puede
 * hacer (hoy el banco responde 403), la orden queda pendiente: el sistema falla "cerrado", nunca da por pagado.
 *
 * El core no importa módulos: cada módulo registra su enganche (`registrarEnganchePago`) y el core lo llama, dentro
 * de la transacción de la confirmación, para pasar la solicitud a pagada y emitir el certificado.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { confirmarPago, construirFormulario, cuentaDesdeEnv, type FormularioPago } from './payments/macroclick.js';

export class ErrorPago extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

export interface OrdenPago {
  id: number;
  modulo_slug: string;
  ref_id: string | null;
  identificador: string | null;
  importe_centavos: number;
  estado: string;
  cuenta: string | null;
  referencia_externa: string | null;
  datos: Record<string, unknown>;
}

export interface EnganchePago {
  /** Cuenta que cobra este módulo si no hay `PAGOS_CUENTA_<MODULO>` en el .env. */
  cuentaPorDefecto?: string;
  /**
   * Se llama dentro de la transacción en que la orden pasa a pagada. Tiene que pasar la solicitud a pagada y
   * emitir lo que corresponda. Si lanza error, el pago NO se pierde: queda registrado y la orden marcada
   * `requiere_revision`. Puede devolver una función para correr después del commit (mails).
   */
  alConfirmarse(client: PoolClient, orden: OrdenPago): Promise<(() => Promise<unknown>) | void>;
}

const enganches = new Map<string, EnganchePago>();
export const registrarEnganchePago = (moduloSlug: string, e: EnganchePago) => void enganches.set(moduloSlug, e);

/** Forma de las referencias que generamos: lo único que se acepta de un aviso o de una URL de retorno. */
export const REFERENCIA = /^BOT-[0-9A-F]{12}$/;

const proveedor = () => (process.env.PAYMENT_PROVIDER === 'macroclick' ? 'macroclick' : 'mock');

export function cuentaDelModulo(moduloSlug: string): string | null {
  const env = process.env[`PAGOS_CUENTA_${moduloSlug.toUpperCase()}`]?.trim();
  return env || enganches.get(moduloSlug)?.cuentaPorDefecto || null;
}

async function enTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const COLUMNAS = `id::int as id, modulo_slug, ref_id, identificador, importe_centavos::float8 as importe_centavos, estado, cuenta, referencia_externa, datos`;

const urlWeb = () => (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, '');

// --- Iniciar el pago ----------------------------------------------------------------------------------------

export interface PagoIniciado {
  referencia: string;
  /** Formulario que el navegador envía al banco (redirección completa). Ausente con el proveedor mock. */
  formulario?: FormularioPago;
}

/**
 * Crea la orden pendiente y arma el formulario. Cada intento crea una orden nueva (con su propia referencia,
 * que el banco ve como un TransaccionComercioId distinto); las abandonadas quedan pendientes hasta que la
 * conciliación las cierre. Va dentro de la transacción del módulo, con la solicitud ya bloqueada.
 * El monto lo fija el servidor: nada que mande el navegador entra en el importe.
 */
export async function iniciarPago(client: PoolClient, p: {
  moduloSlug: string; refId: string | null; identificador: string; importeCentavos: number; descripcion: string; ip: string; datos?: Record<string, unknown>;
  /** Detalle de lo que se cobra (una línea por solicitud): queda en la orden aunque la tarifa cambie después. */
  tarifas?: unknown[];
}): Promise<PagoIniciado> {
  if (!Number.isInteger(p.importeCentavos) || p.importeCentavos <= 0) throw new ErrorPago(409, 'Este trámite no tiene una tarifa válida cargada.');
  const real = proveedor() === 'macroclick';
  const cuentaNombre = cuentaDelModulo(p.moduloSlug);
  let cuenta;
  if (real) {
    if (!cuentaNombre) throw new ErrorPago(503, 'El pago online de este trámite todavía no está habilitado.');
    try {
      cuenta = cuentaDesdeEnv(cuentaNombre);
    } catch (e) {
      console.error(`[pagos] cuenta mal configurada: ${(e as Error).message}`);
      throw new ErrorPago(503, 'El pago online de este trámite todavía no está habilitado.');
    }
  }
  const referencia = `BOT-${randomBytes(6).toString('hex').toUpperCase()}`;
  await client.query(
    `insert into pagos.ordenes_pago (modulo_slug, ref_id, identificador, datos, importe_centavos, tarifas, estado, cuenta, referencia_externa)
     values ($1, $2, $3, $4, $5, $6, 'pendiente', $7, $8)`,
    [p.moduloSlug, p.refId, p.identificador, JSON.stringify(p.datos ?? {}), p.importeCentavos, JSON.stringify(p.tarifas ?? []), cuenta ? cuentaNombre : null, referencia],
  );
  if (!cuenta) return { referencia };
  const retorno = (r: string) => `${urlWeb()}/pagar/retorno?ref=${referencia}&r=${r}`;
  const formulario = construirFormulario(cuenta, {
    transaccionId: referencia, montoCentavos: p.importeCentavos, descripcion: p.descripcion, ip: p.ip,
    urlExito: retorno('exito'), urlCancelar: retorno('cancelado'),
  });
  return { referencia, formulario };
}

// --- Procesar el aviso del banco ----------------------------------------------------------------------------

export type Confirmador = (orden: OrdenPago) => Promise<{ pagado: boolean; estado: 'pagado' | 'rechazado' | 'pendiente' | 'desconocido'; motivo?: string }>;

/** Pregunta al banco, con las credenciales de la cuenta de esa orden. */
export const confirmadorBanco: Confirmador = async (orden) => {
  if (!orden.cuenta || !orden.referencia_externa) throw new Error('La orden no tiene cuenta o referencia');
  return confirmarPago(cuentaDesdeEnv(orden.cuenta), { transaccionId: orden.referencia_externa, montoCentavos: orden.importe_centavos });
};

/** Estados de los que una orden todavía puede pasar a pagada. */
const REABRIBLES = ['pendiente', 'vencida', 'rechazada'];

export type ResultadoAviso = 'pagada' | 'rechazada' | 'sin_confirmar' | 'ya_procesada' | 'desconocida';

/**
 * Procesa el aviso de una referencia. `cuenta`: si se da, la orden tiene que ser de esa cuenta (el aviso llegó
 * por la URL de esa cuenta). `confirmador` solo se cambia en las pruebas con el proveedor mock.
 * Idempotente: avisos repetidos o simultáneos dan una sola confirmación (la orden se bloquea).
 */
export async function procesarAviso(referencia: string, opciones: { cuenta?: string; confirmador?: Confirmador } = {}): Promise<ResultadoAviso> {
  if (!REFERENCIA.test(referencia)) return 'desconocida';
  const { rows } = await pool.query<OrdenPago>(`select ${COLUMNAS} from pagos.ordenes_pago where referencia_externa = $1`, [referencia]);
  const orden = rows[0];
  if (!orden || (opciones.cuenta && orden.cuenta !== opciones.cuenta)) return 'desconocida';
  // Un pago confirmado por el banco gana siempre: también se reabre una orden vencida o rechazada (un aviso perdido, o un
  // reintento en el mismo checkout). Solo es definitiva la ya pagada (y la anulada a mano).
  if (!REABRIBLES.includes(orden.estado)) return 'ya_procesada';

  let r;
  try {
    r = await (opciones.confirmador ?? confirmadorBanco)(orden);
  } catch (e) {
    console.error(`[pagos] no se pudo confirmar ${referencia} con el banco: ${(e as Error).message}`);
    return 'sin_confirmar';
  }
  if (!r.pagado) {
    if (r.estado === 'rechazado') {
      await pool.query("update pagos.ordenes_pago set estado = 'rechazada', updated_at = now() where id = $1 and estado = 'pendiente'", [orden.id]);
      return 'rechazada';
    }
    console.warn(`[pagos] ${referencia} sin confirmar: ${r.motivo ?? r.estado}`);
    return 'sin_confirmar';
  }

  const despues = await enTx(async (client) => {
    const { rows: l } = await client.query<OrdenPago>(`select ${COLUMNAS} from pagos.ordenes_pago where id = $1 for update`, [orden.id]);
    if (!REABRIBLES.includes(l[0].estado)) return null;
    await client.query("update pagos.ordenes_pago set estado = 'pagada', updated_at = now() where id = $1", [orden.id]);
    const prov = proveedor();
    const ins = await client.query<{ id: string }>(
      `insert into pagos.pagos (orden_id, proveedor, referencia_externa, estado, importe_centavos, payload)
       values ($1, $2, $3, 'pagado', $4, $5) on conflict do nothing returning id`,
      [orden.id, prov, referencia, orden.importe_centavos, JSON.stringify({ confirmadoConElBanco: prov === 'macroclick' })],
    );
    const pagoId = ins.rows[0]
      ? Number(ins.rows[0].id)
      : Number((await client.query<{ id: string }>('select id from pagos.pagos where proveedor = $1 and referencia_externa = $2 and estado = $3', [prov, referencia, 'pagado'])).rows[0].id);
    await client.query(
      `insert into pagos.comprobantes (orden_id, pago_id, numero, codigo_verificacion)
       values ($1, $2, $3, $4) on conflict (orden_id) do nothing`,
      [orden.id, pagoId, `REC-${new Date().getFullYear()}-${String(orden.id).padStart(6, '0')}`, randomUUID()],
    );
    // El enganche del módulo en un savepoint: si falla, el pago queda registrado igual y se marca para revisión.
    const enganche = enganches.get(orden.modulo_slug);
    if (!enganche) return null;
    await client.query('savepoint enganche');
    try {
      const post = await enganche.alConfirmarse(client, { ...orden, estado: 'pagada' });
      await client.query('release savepoint enganche');
      return post ?? null;
    } catch (e) {
      await client.query('rollback to savepoint enganche');
      await client.query(`update pagos.ordenes_pago set datos = datos || '{"requiere_revision": true}'::jsonb where id = $1`, [orden.id]);
      console.error(`[pagos] ${referencia} cobrada pero el módulo "${orden.modulo_slug}" no pudo completarla: ${(e as Error).message}`);
      return null;
    }
  });
  if (despues) await despues().catch((e) => console.error(`[pagos] tarea posterior a ${referencia}: ${(e as Error).message}`));
  return 'pagada';
}

/** Estado público de una referencia (lo único que muestra la página de retorno). */
export async function estadoDeReferencia(referencia: string): Promise<string | null> {
  if (!REFERENCIA.test(referencia)) return null;
  const { rows } = await pool.query<{ estado: string }>('select estado from pagos.ordenes_pago where referencia_externa = $1', [referencia]);
  return rows[0]?.estado ?? null;
}

/**
 * Guarda de arranque en producción: toda cuenta que algún módulo vaya a usar tiene que estar completa en el .env
 * (credenciales, clave, sucursal, token del aviso). Así un dato faltante frena el despliegue en vez de aparecer el día que alguien paga.
 */
export function exigirCuentasDePago(): void {
  if (process.env.NODE_ENV !== 'production' || proveedor() !== 'macroclick') return;
  const cuentas = new Set<string>();
  for (const slug of enganches.keys()) {
    const c = cuentaDelModulo(slug);
    if (c) cuentas.add(c);
  }
  if (!cuentas.size) throw new Error('Con macroclick en producción hace falta al menos un módulo con cuenta de pago (PAGOS_CUENTA_<MODULO> en el .env).');
  for (const c of cuentas) {
    try {
      cuentaDesdeEnv(c);
    } catch (e) {
      throw new Error(`La cuenta de pago ${c} está incompleta en el .env: ${(e as Error).message}`);
    }
  }
}
