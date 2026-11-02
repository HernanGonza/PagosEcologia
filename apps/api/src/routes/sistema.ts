import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../db.js';
import { requiereSesionPanel } from '../core/auth-ecodatos.js';
import { estadoMigraciones } from '../core/migraciones.js';
import { correoConfigurado } from '../core/correo.js';
import { storageLocalDir } from '../core/storage.js';
import { leerConfig, type Aviso, type Mantenimiento } from '../core/sistema-config.js';

/**
 * Administración técnica del sistema (apps/sistema). Solo para quienes son admin o superadmin en Ecodatos:
 * el mismo login que los paneles de área, pero acá se exige el rol, no un panel asignado.
 * No tiene nada que ver con el panel de Recaudaciones (/api/admin).
 */
export const sistemaRouter = Router();

function soloAdminSistema(req: Request, res: Response, next: NextFunction) {
  requiereSesionPanel(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.sesionPanel!.usuario.esAdmin) {
      res.status(403).json({ error: 'Esta sección es solo para administradores del sistema.' });
      return;
    }
    next();
  });
}

sistemaRouter.use(soloAdminSistema);

sistemaRouter.get('/yo', (req, res) => {
  const { id, email, nombre } = req.sesionPanel!.usuario;
  res.json({ id, email, nombre });
});

sistemaRouter.get('/modulos', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select m.slug, m.nombre, c.nombre as categoria, m.activo
         from pagos.modulos m join pagos.categorias c on c.slug = m.categoria_slug
        order by c.orden, m.orden, m.nombre`,
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/**
 * Encender o apagar un módulo. Apagado: desaparece de la página pública y su API pública responde 404
 * (ver core/modulo-activo.ts). No borra nada. Queda en la auditoría con quién lo hizo.
 */
sistemaRouter.patch('/modulos/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug);
    if (typeof req.body?.activo !== 'boolean') {
      res.status(400).json({ error: 'Falta indicar si el módulo queda activo o no.' });
      return;
    }
    const activo: boolean = req.body.activo;
    const actor = req.sesionPanel!.usuario.email || req.sesionPanel!.usuario.id;
    const client = await pool.connect();
    try {
      await client.query('begin');
      const previo = await client.query<{ activo: boolean }>('select activo from pagos.modulos where slug = $1 for update', [slug]);
      if (!previo.rows[0]) {
        await client.query('rollback');
        res.status(404).json({ error: 'El módulo no existe.' });
        return;
      }
      if (previo.rows[0].activo !== activo) {
        await client.query('update pagos.modulos set activo = $2 where slug = $1', [slug, activo]);
        await client.query(
          "insert into pagos.auditoria (actor, accion, entidad, entidad_id, antes, despues) values ($4, $5, 'modulo', $1, $2, $3)",
          [slug, { activo: previo.rows[0].activo }, { activo }, actor, activo ? 'modulo-encendido' : 'modulo-apagado'],
        );
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    res.json({ ok: true, activo });
  } catch (error) {
    next(error);
  }
});

// --- Mantenimiento y aviso público --------------------------------------------------------------------

sistemaRouter.get('/config', async (_req, res, next) => {
  try {
    const [mantenimiento, aviso] = await Promise.all([leerConfig('mantenimiento'), leerConfig('aviso')]);
    res.json({ mantenimiento, aviso });
  } catch (e) {
    next(e);
  }
});

/** Guarda una configuración general y deja en la auditoría el valor anterior y el nuevo. */
async function guardarConfig(clave: 'mantenimiento' | 'aviso', valor: Mantenimiento | Aviso, actor: string) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const previo = await client.query<{ valor: unknown }>('select valor from pagos.sistema_config where clave = $1 for update', [clave]);
    await client.query(
      `insert into pagos.sistema_config (clave, valor, actualizado_por) values ($1, $2::jsonb, $3)
       on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por, updated_at = now()`,
      [clave, JSON.stringify(valor), actor],
    );
    await client.query(
      "insert into pagos.auditoria (actor, accion, entidad, entidad_id, antes, despues) values ($1, $2, 'sistema', $3, $4, $5)",
      [actor, `${clave}-cambiado`, clave, previo.rows[0]?.valor ?? null, valor],
    );
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

sistemaRouter.put('/config/mantenimiento', async (req, res, next) => {
  try {
    if (typeof req.body?.activo !== 'boolean') return void res.status(400).json({ error: 'Falta indicar si el mantenimiento queda activo.' });
    const mensaje = String(req.body?.mensaje ?? '').trim().slice(0, 300);
    await guardarConfig('mantenimiento', { activo: req.body.activo, mensaje }, req.sesionPanel!.usuario.email || req.sesionPanel!.usuario.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

sistemaRouter.put('/config/aviso', async (req, res, next) => {
  try {
    const texto = String(req.body?.texto ?? '').trim().slice(0, 300);
    const nivel = req.body?.nivel === 'alerta' ? 'alerta' : 'info';
    if (typeof req.body?.activo !== 'boolean') return void res.status(400).json({ error: 'Falta indicar si el aviso queda activo.' });
    if (req.body.activo && !texto) return void res.status(400).json({ error: 'Escribí el texto del aviso.' });
    await guardarConfig('aviso', { activo: req.body.activo, texto, nivel }, req.sesionPanel!.usuario.email || req.sesionPanel!.usuario.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// --- Estado del sistema ---------------------------------------------------------------------------------

/** Salud y configuración. Solo indica si cada cosa está configurada: nunca devuelve claves ni contraseñas. */
sistemaRouter.get('/estado', async (_req, res, next) => {
  try {
    const t0 = Date.now();
    const [migraciones, tamanio, ordenes, verificaciones] = await Promise.all([
      estadoMigraciones(),
      pool.query<{ bytes: string }>('select pg_database_size(current_database())::text as bytes'),
      pool.query<{ pendientes: number }>("select count(*)::int as pendientes from pagos.ordenes_pago where estado = 'pendiente'"),
      pool.query<{ n: number }>("select count(*)::int as n from pagos.verificaciones_email where created_at > now() - interval '24 hours'"),
    ]);
    const baseMs = Date.now() - t0;
    const produccion = process.env.NODE_ENV === 'production';
    const entorno = {
      produccion,
      proveedorPago: process.env.PAYMENT_PROVIDER || '(sin definir)',
      correo: correoConfigurado() ? (process.env.MAIL_PROVIDER === 'consola' ? 'consola (no envía)' : 'configurado') : 'sin configurar',
      almacenamiento: storageLocalDir() ? 'disco local' : process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Supabase Storage' : 'sin configurar',
      loginLocal: process.env.AUTH_LOCAL === 'true',
      emisionSimulada: process.env.EMISION_SIMULADA === '1',
      webUrl: Boolean(process.env.WEB_URL?.trim()),
      trustProxy: Boolean(process.env.TRUST_PROXY?.trim()),
    };
    const alertas: string[] = [];
    if (migraciones.faltan.length) alertas.push(`Faltan migraciones: ${migraciones.faltan.join(', ')}`);
    if (produccion && entorno.correo !== 'configurado') alertas.push('El correo no está configurado para enviar: las personas no reciben los códigos.');
    if (produccion && entorno.emisionSimulada) alertas.push('EMISION_SIMULADA está activa en producción: se podrían emitir certificados sin pagar.');
    if (produccion && entorno.loginLocal) alertas.push('AUTH_LOCAL está activo en producción.');
    if (produccion && entorno.proveedorPago !== 'macroclick') alertas.push('El proveedor de pago no es macroclick.');
    res.json({
      ahora: new Date().toISOString(),
      nodo: process.version,
      baseMs,
      baseBytes: Number(tamanio.rows[0].bytes),
      migraciones,
      ordenesPendientes: ordenes.rows[0].pendientes,
      codigosUltimas24h: verificaciones.rows[0].n,
      entorno,
      alertas,
    });
  } catch (e) {
    next(e);
  }
});

// --- Auditoría completa ---------------------------------------------------------------------------------

sistemaRouter.get('/auditoria', async (req, res, next) => {
  try {
    const accion = typeof req.query.accion === 'string' && req.query.accion ? req.query.accion : null;
    const [filas, acciones] = await Promise.all([
      pool.query(
        `select id, actor, accion, entidad, entidad_id, antes, despues, created_at
           from pagos.auditoria where ($1::text is null or accion = $1) order by created_at desc, id desc limit 200`,
        [accion],
      ),
      pool.query<{ accion: string }>('select distinct accion from pagos.auditoria order by accion'),
    ]);
    res.json({
      acciones: acciones.rows.map((a) => a.accion),
      filas: filas.rows.map((r) => ({
        id: Number(r.id),
        actor: r.actor,
        accion: r.accion,
        entidad: r.entidad,
        entidadId: r.entidad_id,
        antes: r.antes,
        despues: r.despues,
        creadaEn: r.created_at.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

// --- Quién tiene acceso a qué ---------------------------------------------------------------------------

/** Solo lectura: los permisos se administran en Ecodatos. Sirve para revisar quién entra a cada panel. */
sistemaRouter.get('/accesos', async (_req, res, next) => {
  try {
    const [admins, areas, formularios, modulos] = await Promise.all([
      pool.query(
        `select r.key as rol, p.full_name as nombre, p.email
           from public.usuarios_rol ur join public.roles r on r.id = ur.rol_id
           left join public.profiles p on p.id = ur.user_id
          where ur.activo and r.key in ('admin', 'superadmin') order by r.key, p.full_name nulls last`,
      ),
      pool.query(
        `select a.key as area, a.nombre as area_nombre, p.full_name as nombre, p.email, ua.es_editor
           from public.usuarios_areas ua join public.areas a on a.id = ua.area_id
           left join public.profiles p on p.id = ua.user_id
          where ua.activo and a.activo order by a.nombre, p.full_name nulls last`,
      ),
      pool.query(
        `select f.slug as formulario, p.full_name as nombre, p.email, uf.es_editor
           from public.usuarios_formularios uf join public.formularios f on f.id = uf.formulario_id
           left join public.profiles p on p.id = uf.user_id
          where f.activo order by f.slug, p.full_name nulls last`,
      ),
      pool.query(`select slug, nombre, activo, config->'panel' as panel from pagos.modulos where config ? 'panel' order by orden, nombre`),
    ]);
    res.json({
      administradores: admins.rows,
      // Por cada panel de módulo: qué formularios/áreas de Ecodatos dan acceso y quiénes los tienen hoy.
      paneles: modulos.rows.map((m) => {
        const formsDelPanel: string[] = m.panel?.formularios ?? [];
        const areasDelPanel: string[] = m.panel?.areas ?? [];
        return {
          slug: m.slug,
          nombre: m.nombre,
          activo: m.activo,
          formularios: formsDelPanel,
          areas: areasDelPanel,
          personas: [
            ...formularios.rows.filter((f) => formsDelPanel.includes(f.formulario)).map((f) => ({ nombre: f.nombre, email: f.email, por: `formulario ${f.formulario}`, editor: f.es_editor })),
            ...areas.rows.filter((a) => areasDelPanel.includes(a.area)).map((a) => ({ nombre: a.nombre, email: a.email, por: `área ${a.area_nombre}`, editor: a.es_editor })),
          ],
        };
      }),
      recaudaciones: areas.rows.filter((a) => a.area === 'recaudaciones').map((a) => ({ nombre: a.nombre, email: a.email })),
    });
  } catch (e) {
    next(e);
  }
});
