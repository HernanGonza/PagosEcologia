import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db.js';
import { leerConfig } from './sistema-config.js';

/**
 * Corta las rutas públicas de un módulo apagado desde el panel de administración (pagos.modulos.activo).
 * Se consulta en cada pedido, así que apagar o encender surte efecto al instante.
 * También corta todo si el equipo técnico activó el modo mantenimiento (pagos.sistema_config).
 * Siguen funcionando aunque el módulo esté apagado:
 *  - /panel: los técnicos terminan de resolver lo que ya está en curso (el panel además exige sus permisos);
 *  - /verificar: el QR de los certificados ya emitidos tiene que seguir validando.
 */
export function moduloActivo(slug: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/panel') || req.path.startsWith('/verificar/')) return next();
    try {
      const mantenimiento = await leerConfig('mantenimiento');
      if (mantenimiento.activo) {
        res.status(503).json({ error: mantenimiento.mensaje || 'El sitio está en mantenimiento. Volvé a intentar en un rato.', codigo: 'mantenimiento' });
        return;
      }
      const { rows } = await pool.query<{ activo: boolean }>('select activo from pagos.modulos where slug = $1', [slug]);
      if (rows[0]?.activo) return next();
      res.status(404).json({ error: 'Este trámite no está disponible por el momento.', codigo: 'modulo_inactivo' });
    } catch (e) {
      next(e);
    }
  };
}
