import { Router } from 'express';
import type { CatalogoResponse } from '@botonera/shared';
import { pool } from '../db.js';
import { leerConfig } from '../core/sistema-config.js';

export const modulosRouter = Router();

modulosRouter.get('/', async (_req, res, next) => {
  try {
    const [cats, mods, mant, aviso] = await Promise.all([
      pool.query('select slug, nombre, orden from pagos.categorias order by orden'),
      pool.query(
        `select slug, nombre, descripcion, icono, categoria_slug, tipo, orden
           from pagos.modulos where activo order by orden`,
      ),
      leerConfig('mantenimiento'),
      leerConfig('aviso'),
    ]);
    const body: CatalogoResponse = {
      categorias: cats.rows,
      modulos: mods.rows,
      aviso: aviso.activo && aviso.texto ? { texto: aviso.texto, nivel: aviso.nivel } : null,
      mantenimiento: mant.activo ? { mensaje: mant.mensaje } : null,
    };
    res.json(body);
  } catch (e) {
    next(e);
  }
});
