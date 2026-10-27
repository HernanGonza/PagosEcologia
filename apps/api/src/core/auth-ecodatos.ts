/**
 * Ingreso a los paneles de área con el usuario de Ecodatos (Supabase Auth de la misma instancia).
 *
 * El panel inicia sesión contra Supabase y manda el token de acceso en `Authorization: Bearer`.
 * La API lo valida preguntándole a Supabase quién es (/auth/v1/user) y después decide a qué
 * paneles entra según los permisos que esa persona ya tiene en Ecodatos (ver 0006):
 *   - admin o superadmin de Ecodatos: todos los paneles, con edición;
 *   - un formulario o un área de `modulos.config.panel`: ese panel; `es_editor` define si actúa.
 *
 *   SUPABASE_URL / SUPABASE_INTERNAL_URL  (ver core/storage.ts)
 *   SUPABASE_ANON_KEY                     clave pública de Supabase, la misma que usa el panel
 */
import type { NextFunction, Request, Response } from 'express';
import type { ConfigPanel, ModuloPanel, UsuarioPanel } from '@botonera/shared';
import { pool } from '../db.js';

const env = (k: string) => (process.env[k] ?? '').trim().replace(/\/+$/, '');

export interface SesionPanel {
  usuario: UsuarioPanel;
  modulos: ModuloPanel[];
}

declare module 'express-serve-static-core' {
  interface Request {
    sesionPanel?: SesionPanel;
  }
}

/** El login de Ecodatos no se puede validar (configuración o Supabase caído): 503, no 500. */
export class ErrorAuthEcodatos extends Error {}

// Supabase se consulta una vez por token cada minuto, no en cada pedido.
const cache = new Map<string, { sesion: SesionPanel; vence: number }>();
const CACHE_MS = 60_000;

async function usuarioDeToken(token: string): Promise<{ id: string; email: string } | null> {
  const url = env('SUPABASE_INTERNAL_URL') || env('SUPABASE_URL');
  const anon = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !anon) throw new ErrorAuthEcodatos('Falta SUPABASE_URL o SUPABASE_ANON_KEY en el .env de la API (reiniciala después de cargarlas).');
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new ErrorAuthEcodatos(`Supabase Auth respondió ${res.status}.`);
  const u = (await res.json()) as { id?: string; email?: string };
  return u.id ? { id: u.id, email: u.email ?? '' } : null;
}

export async function permisosDeUsuario(id: string, email: string): Promise<SesionPanel> {
  const [perfil, admin, formularios, areas, modulos] = await Promise.all([
    pool.query<{ full_name: string | null }>('select full_name from public.profiles where id = $1', [id]),
    pool.query(
      `select 1 from public.usuarios_rol ur join public.roles r on r.id = ur.rol_id
        where ur.user_id = $1 and ur.activo and r.key in ('admin', 'superadmin') limit 1`,
      [id],
    ),
    pool.query<{ slug: string; es_editor: boolean }>(
      `select f.slug, coalesce(uf.es_editor, true) as es_editor
         from public.usuarios_formularios uf join public.formularios f on f.id = uf.formulario_id
        where uf.user_id = $1 and f.activo`,
      [id],
    ),
    pool.query<{ key: string; es_editor: boolean }>(
      `select a.key, coalesce(ua.es_editor, true) as es_editor
         from public.usuarios_areas ua join public.areas a on a.id = ua.area_id
        where ua.user_id = $1 and ua.activo and a.activo`,
      [id],
    ),
    pool.query<{ slug: string; nombre: string; panel: ConfigPanel }>(
      `select slug, nombre, config->'panel' as panel from pagos.modulos
        where activo and config ? 'panel' order by orden, nombre`,
    ),
  ]);

  const esAdmin = admin.rowCount! > 0;
  const editorFormulario = new Map(formularios.rows.map((f) => [f.slug, f.es_editor]));
  const editorArea = new Map(areas.rows.map((a) => [a.key, a.es_editor]));

  const accesibles: ModuloPanel[] = [];
  for (const m of modulos.rows) {
    if (esAdmin) {
      accesibles.push({ slug: m.slug, nombre: m.nombre, puedeEditar: true });
      continue;
    }
    const permisos = [
      ...(m.panel.formularios ?? []).filter((f) => editorFormulario.has(f)).map((f) => editorFormulario.get(f)!),
      ...(m.panel.areas ?? []).filter((a) => editorArea.has(a)).map((a) => editorArea.get(a)!),
    ];
    if (permisos.length) accesibles.push({ slug: m.slug, nombre: m.nombre, puedeEditar: permisos.some(Boolean) });
  }

  return {
    usuario: { id, email, nombre: perfil.rows[0]?.full_name ?? null, esAdmin },
    modulos: accesibles,
  };
}

/** Exige un usuario de Ecodatos con sesión. Deja la sesión en `req.sesionPanel`. */
export async function requiereSesionPanel(req: Request, res: Response, next: NextFunction) {
  const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
  if (!token) {
    res.status(401).json({ error: 'Iniciá sesión con tu usuario de Ecodatos.' });
    return;
  }
  try {
    const guardada = cache.get(token);
    if (guardada && guardada.vence > Date.now()) {
      req.sesionPanel = guardada.sesion;
      return next();
    }
    const usuario = await usuarioDeToken(token);
    if (!usuario) {
      cache.delete(token);
      res.status(401).json({ error: 'La sesión venció. Volvé a ingresar.' });
      return;
    }
    const sesion = await permisosDeUsuario(usuario.id, usuario.email);
    cache.set(token, { sesion, vence: Date.now() + CACHE_MS });
    if (cache.size > 1000) for (const [k, v] of cache) if (v.vence <= Date.now()) cache.delete(k);
    req.sesionPanel = sesion;
    next();
  } catch (error) {
    if (error instanceof ErrorAuthEcodatos || (error as Error).name === 'TimeoutError') {
      console.error('[paneles]', (error as Error).message);
      res.status(503).json({ error: 'No se puede validar el ingreso con Ecodatos en este momento.' });
      return;
    }
    next(error);
  }
}

/** Exige acceso al panel de un módulo. Con `edicion`, además que pueda actuar. */
export function requierePanel(slug: string, { edicion = false } = {}) {
  return (req: Request, res: Response, next: NextFunction) =>
    requiereSesionPanel(req, res, (err?: unknown) => {
      if (err) return next(err);
      const modulo = req.sesionPanel!.modulos.find((m) => m.slug === slug);
      if (!modulo) {
        res.status(403).json({ error: 'Tu usuario de Ecodatos no tiene asignado este panel.' });
        return;
      }
      if (edicion && !modulo.puedeEditar) {
        res.status(403).json({ error: 'Tu usuario tiene acceso de solo lectura a este panel.' });
        return;
      }
      next();
    });
}
