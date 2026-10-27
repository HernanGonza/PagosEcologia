import { Router } from 'express';
import { pool } from '../../db.js';

export const fitosanitariosRouter = Router();

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
