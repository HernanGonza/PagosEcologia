/**
 * Rutas del pago online:
 *   POST /api/pagos/webhook/:cuenta/:token   aviso del banco (sin firma: ver core/pagos-online.ts)
 *   GET  /api/pagos/orden/:ref/estado         estado de una orden, para la página de retorno
 *   POST /api/pagos/mock/:ref/pagar           SOLO desarrollo con proveedor mock: simula el aviso confirmado
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { cuentaDesdeEnv } from '../core/payments/macroclick.js';
import { esPedidoLocal } from '../core/pago-simulado.js';
import { REFERENCIA, estadoDeReferencia, procesarAviso } from '../core/pagos-online.js';

export const pagosRouter = Router();

// Tope por IP en memoria (frena un barrido; con varias instancias, ponerlo también en el proxy).
const pedidos = new Map<string, { n: number; desde: number }>();
function demasiados(req: Request, max = 120): boolean {
  const ip = req.ip ?? 'desconocida';
  const ahora = Date.now();
  const p = pedidos.get(ip);
  if (!p || ahora - p.desde > 60_000) {
    pedidos.set(ip, { n: 1, desde: ahora });
    if (pedidos.size > 5000) pedidos.clear();
    return false;
  }
  return ++p.n > max;
}

const hash = (s: string) => createHash('sha256').update(s).digest();
const tokenIgual = (a: string, b: string) => b.length > 0 && timingSafeEqual(hash(a), hash(b));

/** La referencia que nos interesa de un aviso: la del formato de pago o la del formato de link. Cualquier otra cosa se ignora. */
function referenciaDelAviso(body: unknown): string | null {
  const b = (body ?? {}) as { TransaccionComercioId?: unknown; payload?: { external_reference?: unknown } };
  const candidata = b.TransaccionComercioId ?? b.payload?.external_reference;
  return typeof candidata === 'string' && REFERENCIA.test(candidata) ? candidata : null;
}

pagosRouter.post('/webhook/:cuenta/:token', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (demasiados(req)) return void res.status(429).json({ ok: false });
  // Siempre la misma respuesta 200: no se le cuenta a quien sondea qué cuentas, tokens u órdenes existen.
  res.json({ ok: true });
  try {
    const nombre = String(req.params.cuenta).toUpperCase();
    let cuenta;
    try {
      cuenta = cuentaDesdeEnv(nombre);
    } catch {
      return;
    }
    if (!tokenIgual(String(req.params.token), cuenta.webhookToken)) {
      console.warn(`[pagos] aviso con token incorrecto para la cuenta ${nombre}`);
      return;
    }
    const ref = referenciaDelAviso(req.body);
    if (!ref) return;
    const r = await procesarAviso(ref, { cuenta: nombre });
    console.log(`[pagos] aviso ${ref} (${nombre}): ${r}`);
  } catch (e) {
    console.error(`[pagos] error procesando un aviso: ${(e as Error).message}`);
  }
});

pagosRouter.get('/orden/:ref/estado', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (demasiados(req, 300)) return void res.status(429).json({ error: 'Demasiados pedidos.' });
    const estado = await estadoDeReferencia(String(req.params.ref));
    if (!estado) return void res.status(404).json({ error: 'No encontramos ese pago.' });
    res.json({ estado });
  } catch (e) {
    next(e);
  }
});

// Para probar el circuito completo sin el banco. Con el proveedor real o en producción no existe.
if (process.env.PAYMENT_PROVIDER !== 'macroclick' && process.env.NODE_ENV !== 'production') {
  pagosRouter.post('/mock/:ref/pagar', async (req, res, next) => {
    try {
      if (!esPedidoLocal(req)) return void res.status(404).json({ error: 'No encontramos lo que buscás.' });
      const r = await procesarAviso(String(req.params.ref), { confirmador: async () => ({ pagado: true, estado: 'pagado' }) });
      res.json({ resultado: r });
    } catch (e) {
      next(e);
    }
  });
}
