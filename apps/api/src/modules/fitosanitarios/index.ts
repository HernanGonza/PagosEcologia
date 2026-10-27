import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { ErrorCorreo } from '../../core/correo.js';
import { ErrorStorage } from '../../core/storage.js';
import { panelRouter } from './panel.js';
import { publicoRouter } from './publico.js';
import { MODULO, ErrorSolicitud } from './solicitudes.js';
import { registrarPendientes } from '../../routes/paneles.js';

export const fitosanitariosRouter = Router();

// Badge del panel: enviadas que todavía no tomó ningún técnico (incluye las reenviadas con correcciones).
registrarPendientes(MODULO, async () => {
  const { rows } = await pool.query<{ n: number }>("select count(*)::int as n from pagos.fito_solicitudes where estado = 'enviada'");
  return rows[0].n;
});

// El registro es public.fitosanitarios_domisanitarios (Ecodatos). Todavía no tiene DNI/CUIT
// ni fecha de vencimiento: los agrega el área y recién ahí se habilita la búsqueda.
fitosanitariosRouter.get('/certificados/:identificador', (req, res) => {
  const identificador = String(req.params.identificador).replace(/\D/g, '');
  if (identificador.length !== 8 && identificador.length !== 11) {
    res.status(400).json({ error: 'Ingresá un DNI de 8 dígitos o un CUIT de 11 dígitos.' });
    return;
  }
  res.status(503).json({ error: 'La búsqueda por DNI o CUIT todavía no está disponible.' });
});

fitosanitariosRouter.get('/tarifa', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `select id, valor as importe_centavos, vigente_desde
         from pagos.tarifas
        where modulo_slug = 'fitosanitarios'
          and concepto = 'renovacion-anual'
          and vigente_desde <= current_date
        order by vigente_desde desc, id desc
        limit 1`,
    );
    if (!result.rowCount) {
      res.status(503).json({ error: 'El valor de renovación todavía no está configurado.' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Solicitudes con revisión técnica: la parte pública (sin cuenta) y el panel del área.
fitosanitariosRouter.use('/panel', panelRouter);
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
