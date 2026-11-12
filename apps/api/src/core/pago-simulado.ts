/**
 * Registro contable de un pago SIMULADO (demostración). Deja lo mismo que dejaría un pago real confirmado
 * (orden pagada + pago del proveedor "mock" + comprobante) para que el panel de Recaudaciones lo muestre
 * en sus estadísticas y listados. Se llama dentro de la transacción de la solicitud.
 * Con la pasarela real esto lo hace el webhook confirmado: este archivo se borra junto con el botón simulado.
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export interface PagoSimuladoEntrada {
  moduloSlug: string;
  /** Id de la solicitud (referencia al registro del módulo). */
  refId: string;
  /** Número visible de la solicitud (ej. FITO-2026-000004). */
  identificador: string;
  importeCentavos: number;
  datos?: Record<string, unknown>;
}

export async function registrarPagoSimulado(client: PoolClient, p: PagoSimuladoEntrada): Promise<{ ordenId: number; comprobante: string }> {
  if (!(p.importeCentavos > 0)) throw new Error('El importe del pago tiene que ser mayor a cero.');
  const { rows: o } = await client.query<{ id: string }>(
    `insert into pagos.ordenes_pago (modulo_slug, ref_id, identificador, datos, importe_centavos, estado)
     values ($1, $2, $3, $4, $5, 'pagada') returning id`,
    [p.moduloSlug, p.refId, p.identificador, JSON.stringify({ ...p.datos, simulado: true }), p.importeCentavos],
  );
  const ordenId = Number(o[0].id);
  const { rows: pg } = await client.query<{ id: string }>(
    `insert into pagos.pagos (orden_id, proveedor, referencia_externa, estado, importe_centavos, payload)
     values ($1, 'mock', $2, 'pagado', $3, $4) returning id`,
    [ordenId, `mock-${ordenId}`, p.importeCentavos, JSON.stringify({ simulado: true })],
  );
  const comprobante = `REC-${new Date().getFullYear()}-${String(ordenId).padStart(6, '0')}`;
  await client.query(
    'insert into pagos.comprobantes (orden_id, pago_id, numero, codigo_verificacion) values ($1, $2, $3, $4)',
    [ordenId, Number(pg[0].id), comprobante, randomUUID()],
  );
  return { ordenId, comprobante };
}
