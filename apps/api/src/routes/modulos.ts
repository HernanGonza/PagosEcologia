import { Router } from 'express';
import type { CatalogoResponse } from '@botonera/shared';
import { pool } from '../db.js';

export const modulosRouter = Router();

modulosRouter.get('/', async (_req, res, next) => {
  try {
    const [cats, mods] = await Promise.all([
      pool.query('select slug, nombre, orden from recaudaciones.categorias order by orden'),
      pool.query(
        `select slug, nombre, descripcion, icono, categoria_slug, tipo, orden
           from recaudaciones.modulos where activo order by orden`,
      ),
    ]);
    const body: CatalogoResponse = { categorias: cats.rows, modulos: mods.rows };
    res.json(body);
  } catch (e) {
    next(e);
  }
});
