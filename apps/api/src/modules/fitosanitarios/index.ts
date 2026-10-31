import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { ErrorCorreo } from '../../core/correo.js';
import { ErrorStorage } from '../../core/storage.js';
import { panelRouter } from './panel.js';
import { publicoRouter, seguridadPublica } from './publico.js';
import { personaRouter } from './persona.js';
import { emitirCertificado, verificarPorCodigo } from './certificados.js';
import { MODULO, ErrorSolicitud, bloquear, cambiarEstado, enTransaccion } from './solicitudes.js';
import { registrarPendientes } from '../../routes/paneles.js';

export const fitosanitariosRouter = Router();

// Badge del panel: enviadas que todavía no tomó ningún técnico (incluye las reenviadas con correcciones).
registrarPendientes(MODULO, async () => {
  const { rows } = await pool.query<{ n: number }>("select count(*)::int as n from pagos.fito_solicitudes where estado = 'enviada'");
  return rows[0].n;
});

// --- Verificación pública del certificado (la abre el QR del PDF) -----------------------------------
// Sin cookies ni sesión. Datos mínimos; un código inexistente o mal formado da siempre la misma respuesta.
// Tope por IP en memoria (alcanza para frenar un barrido; con varias instancias, ponerlo también en el proxy).
const pedidosVerificacion = new Map<string, { n: number; desde: number }>();
fitosanitariosRouter.get('/verificar/:codigo', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const ip = req.ip ?? 'desconocida';
    const ahora = Date.now();
    const previo = pedidosVerificacion.get(ip);
    const ventana = previo && ahora - previo.desde < 60_000 ? previo : { n: 0, desde: ahora };
    ventana.n += 1;
    pedidosVerificacion.set(ip, ventana);
    if (pedidosVerificacion.size > 10_000) pedidosVerificacion.clear();
    if (ventana.n > 30) {
      res.status(429).json({ error: 'Demasiadas consultas. Esperá un minuto.' });
      return;
    }
    const v = await verificarPorCodigo(String(req.params.codigo));
    if (!v) {
      res.status(404).json({ error: 'No encontramos un certificado con ese código.' });
      return;
    }
    res.json(v);
  } catch (error) {
    next(error);
  }
});

// Emisión SIMULADA, solo para probar el circuito en desarrollo: el pago real todavía no está implementado.
// Con EMISION_SIMULADA=1 una solicitud aprobada se marca pagada y se emite. Nunca en producción.
if (process.env.EMISION_SIMULADA === '1') {
  if (process.env.NODE_ENV === 'production') throw new Error('EMISION_SIMULADA no puede estar activa en producción.');
  fitosanitariosRouter.post('/dev/emitir/:numero', async (req, res, next) => {
    try {
      const { rows } = await pool.query<{ id: string }>('select id from pagos.fito_solicitudes where numero = $1', [String(req.params.numero)]);
      if (!rows[0]) throw new ErrorSolicitud(404, 'La solicitud no existe.');
      const c = await enTransaccion(async (client) => {
        const s = await bloquear(client, rows[0].id);
        if (s.estado !== 'aprobada') throw new ErrorSolicitud(409, 'La solicitud tiene que estar aprobada.');
        await cambiarEstado(client, s, 'pagada', { actor: 'sistema', nota: 'Pago simulado (desarrollo).' });
        return emitirCertificado(client, { ...s, estado: 'pagada' }, { actor: 'sistema' });
      });
      res.json(c);
    } catch (error) {
      next(error);
    }
  });
}

// Solicitudes con revisión técnica: la parte pública (sin cuenta) y el panel del área.
fitosanitariosRouter.use('/panel', panelRouter);
fitosanitariosRouter.use('/persona', seguridadPublica, personaRouter);
fitosanitariosRouter.use(publicoRouter);

// Errores esperables con su mensaje; el resto, 500 sin detalles hacia afuera.
fitosanitariosRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof ErrorSolicitud) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if ((error as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'El archivo supera los 10 MB.' });
    return;
  }
  if (error instanceof ErrorStorage || error instanceof ErrorCorreo) {
    console.error(error);
    res.status(503).json({ error: 'No se pudo completar la operación. Probá de nuevo en unos minutos.' });
    return;
  }
  next(error);
});
