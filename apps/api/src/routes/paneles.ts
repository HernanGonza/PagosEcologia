import { Router } from 'express';
import type { PendientesPanel, YoPanel } from '@botonera/shared';
import { requiereSesionPanel } from '../core/auth-ecodatos.js';

export const panelesRouter = Router();

/**
 * Cada módulo con panel registra cómo contar sus solicitudes nuevas (las que todavía no tomó
 * nadie). Es el número del badge en el inicio y en el menú de apps/paneles.
 */
const contadores = new Map<string, () => Promise<number>>();
export function registrarPendientes(slug: string, contar: () => Promise<number>) {
  contadores.set(slug, contar);
}

/** Quién es y a qué paneles de área entra, según sus permisos en Ecodatos. */
panelesRouter.get('/yo', requiereSesionPanel, (req, res) => {
  const body: YoPanel = req.sesionPanel!;
  res.json(body);
});

/** Solicitudes nuevas de cada panel al que entra la persona. */
panelesRouter.get('/pendientes', requiereSesionPanel, async (req, res, next) => {
  try {
    const slugs = req.sesionPanel!.modulos.map((m) => m.slug).filter((slug) => contadores.has(slug));
    const cantidades = await Promise.all(slugs.map((slug) => contadores.get(slug)!()));
    const body: PendientesPanel = Object.fromEntries(slugs.map((slug, i) => [slug, cantidades[i]]));
    res.json(body);
  } catch (e) {
    next(e);
  }
});
