/**
 * Conciliación de pagos (tarea diaria: `npm run pagos:conciliar`).
 *
 * El aviso del banco puede perderse (el servidor estaba caído, hubo un corte, el banco no reintenta) y el contribuyente
 * puede abandonar el checkout. Esta tarea le pregunta al banco por cada orden que quedó sin resolver y:
 *   - REALIZADA con el monto exacto → la confirma (igual que un aviso: misma función, mismo enganche del módulo);
 *   - RECHAZADA / EXPIRADA / CANCELADA / VENCIDA → la deja rechazada;
 *   - todavía en curso → no toca nada;
 *   - el banco no la conoce y pasaron varios días → la deja vencida (el contribuyente nunca llegó a pagar);
 *   - el banco no responde (hoy 403) → no cambia NADA y lo informa: cerrar órdenes sin poder preguntar podría tapar un
 *     pago real. Las vencidas y rechazadas recientes también se vuelven a mirar, por si el pago llegó tarde.
 * Idempotente: se puede correr las veces que haga falta.
 */
import { pool } from '../db.js';
import { confirmadorBanco, procesarAviso, type OrdenPago } from './pagos-online.js';

export interface ResumenConciliacion {
  omitida?: string;
  revisadas: number;
  pagadas: number;
  rechazadas: number;
  vencidas: number;
  siguenPendientes: number;
  errores: number;
  /** Varias consultas seguidas fallaron: el banco no responde o no habilitó la consulta. */
  bancoNoResponde: boolean;
}

const CORTE_ERRORES = 5;

export async function conciliar(opciones: { minutosMinimos?: number; diasParaVencer?: number; diasParaReverificar?: number; maximo?: number } = {}): Promise<ResumenConciliacion> {
  const minutos = opciones.minutosMinimos ?? 15;
  const diasVencer = opciones.diasParaVencer ?? 7;
  const diasReverificar = opciones.diasParaReverificar ?? 30;
  const resumen: ResumenConciliacion = { revisadas: 0, pagadas: 0, rechazadas: 0, vencidas: 0, siguenPendientes: 0, errores: 0, bancoNoResponde: false };
  if (process.env.PAYMENT_PROVIDER !== 'macroclick') return { ...resumen, omitida: 'El proveedor de pago no es macroclick: no hay nada que conciliar.' };

  const { rows } = await pool.query<OrdenPago & { edad_min: number }>(
    `select id::int as id, modulo_slug, ref_id, identificador, importe_centavos::float8 as importe_centavos, estado, cuenta, referencia_externa, datos,
            (extract(epoch from now() - created_at) / 60)::float8 as edad_min
       from pagos.ordenes_pago
      where referencia_externa is not null and cuenta is not null
        and ( (estado = 'pendiente' and created_at < now() - make_interval(mins => $1))
           or (estado in ('vencida', 'rechazada') and created_at > now() - make_interval(days => $2)) )
      order by created_at limit $3`,
    [minutos, diasReverificar, opciones.maximo ?? 500],
  );

  let seguidos = 0;
  for (const orden of rows) {
    resumen.revisadas++;
    let r;
    try {
      r = await confirmadorBanco(orden);
      seguidos = 0;
    } catch (e) {
      resumen.errores++;
      console.error(`[conciliacion] ${orden.referencia_externa}: ${(e as Error).message}`);
      if (++seguidos >= CORTE_ERRORES) {
        resumen.bancoNoResponde = true;
        break; // no se sigue golpeando a un banco que no contesta
      }
      continue;
    }
    // La respuesta ya está en mano: se reusa en vez de volver a preguntar.
    const res = await procesarAviso(orden.referencia_externa!, { cuenta: orden.cuenta!, confirmador: async () => r });
    if (res === 'pagada') {
      resumen.pagadas++;
      await auditar(orden, 'conciliacion.pagada', { de: orden.estado });
    } else if (res === 'rechazada') {
      resumen.rechazadas++;
      await auditar(orden, 'conciliacion.rechazada', { de: orden.estado });
    } else if (r.estado === 'desconocido' && orden.estado === 'pendiente' && orden.edad_min > diasVencer * 24 * 60) {
      const u = await pool.query("update pagos.ordenes_pago set estado = 'vencida', updated_at = now() where id = $1 and estado = 'pendiente'", [orden.id]);
      if (u.rowCount) {
        resumen.vencidas++;
        await auditar(orden, 'conciliacion.vencida', { motivo: `El banco no la conoce y pasaron más de ${diasVencer} días` });
      }
    } else if (orden.estado === 'pendiente') {
      resumen.siguenPendientes++;
    }
  }

  await pool.query(
    "insert into pagos.auditoria (actor, accion, entidad, despues) values ('sistema', 'conciliacion', 'pagos', $1)",
    [JSON.stringify(resumen)],
  );
  return resumen;
}

const auditar = (orden: OrdenPago, accion: string, despues: Record<string, unknown>) =>
  pool.query(
    'insert into pagos.auditoria (actor, accion, entidad, entidad_id, despues) values ($1, $2, $3, $4, $5)',
    ['sistema', accion, 'orden_pago', String(orden.id), JSON.stringify({ referencia: orden.referencia_externa, ...despues })],
  );
