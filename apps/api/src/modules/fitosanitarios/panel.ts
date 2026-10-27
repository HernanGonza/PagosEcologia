/**
 * Panel de fitosanitarios: los técnicos con el formulario de fitosanitarios en Ecodatos revisan
 * las solicitudes y las aprueban, observan o rechazan. Cada acción avisa por mail a la persona
 * y queda en el historial de la solicitud y en `pagos.auditoria`.
 */
import { Router, type Request } from 'express';
import type { EstadoSolicitud, SolicitudesPanelResponse, SolicitudPanel, SolicitudResumenPanel } from '@botonera/shared';
import { estadosSolicitud } from '@botonera/shared';
import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import { requierePanel } from '../../core/auth-ecodatos.js';
import { enlaceFirmado } from '../../core/storage.js';
import {
  BUCKET,
  ErrorSolicitud,
  MODULO,
  avisar,
  bloquear,
  cambiarEstado,
  configModulo,
  documentoPublico,
  documentos,
  enTransaccion,
  enlaceDeSolicitud,
  historial,
  solicitudPorId,
  solicitudPublica,
  type FilaSolicitud,
} from './solicitudes.js';

export const panelRouter = Router();

const lectura = requierePanel(MODULO);
const edicion = requierePanel(MODULO, { edicion: true });

/** Quién hace la acción: queda en el historial, en las observaciones y en la auditoría. */
const quien = (req: Request) => {
  const u = req.sesionPanel!.usuario;
  return { id: u.id, nombre: u.nombre ?? u.email, email: u.email, ip: req.ip ?? null };
};
type Tecnico = ReturnType<typeof quien>;

const tomadaPor = (yo: Tecnico) => ({ revisor_id: yo.id, revisor_nombre: yo.nombre, revisor_email: yo.email, tomada_en: new Date() });
/** Aprobar, observar o rechazar sin haberla tomado antes también la toma; si ya la tenía otro, no se pisa. */
const tomarSiFalta = (s: FilaSolicitud, yo: Tecnico) => (s.revisor_id ? {} : tomadaPor(yo));
const resueltaPor = (yo: Tecnico) => ({ resuelta_en: new Date(), resuelta_por_id: yo.id, resuelta_por_nombre: yo.nombre, resuelta_por_email: yo.email });

/** Qué acciones admite cada estado. */
const accionesPorEstado: Partial<Record<EstadoSolicitud, SolicitudPanel['acciones']>> = {
  enviada: ['tomar', 'aprobar', 'observar', 'rechazar'],
  en_revision: ['aprobar', 'observar', 'rechazar'],
};

function exigirAccion(s: FilaSolicitud, accion: SolicitudPanel['acciones'][number]) {
  if (!accionesPorEstado[s.estado]?.includes(accion)) {
    throw new ErrorSolicitud(409, 'La solicitud cambió de estado mientras la mirabas. Actualizá la página.');
  }
}

async function auditar(client: PoolClient, req: Request, accion: string, s: FilaSolicitud, despues: unknown) {
  await client.query(
    `insert into pagos.auditoria (actor, accion, entidad, entidad_id, antes, despues)
     values ($1, $2, 'fito_solicitud', $3, $4, $5)`,
    [`ecodatos:${req.sesionPanel!.usuario.email}`, accion, s.id, { estado: s.estado }, { ...(despues as object), ip: req.ip ?? null }],
  );
}

panelRouter.get('/solicitudes', lectura, async (req, res, next) => {
  try {
    const condiciones = ["s.estado <> 'borrador'"]; // los borradores son de la persona, no del área
    const valores: unknown[] = [];
    const agregar = (sql: string, valor: unknown) => {
      valores.push(valor);
      condiciones.push(sql.replace('?', `$${valores.length}`));
    };
    const estado = String(req.query.estado ?? '');
    if (estadosSolicitud.includes(estado as EstadoSolicitud)) agregar('s.estado = ?', estado);
    if (req.query.tipo) agregar('s.tipo = ?', String(req.query.tipo));
    const q = String(req.query.q ?? '').trim();
    if (q) {
      valores.push(`%${q.toLowerCase()}%`);
      const p = `$${valores.length}`;
      condiciones.push(`(lower(s.numero) like ${p} or lower(s.email) like ${p} or lower(s.datos->>'titular') like ${p} or s.datos->>'identificador' like ${p})`);
    }
    const limite = Math.min(Number(req.query.limite) || 50, 200);
    const desde = Math.max(Number(req.query.desde_fila) || 0, 0);
    const where = condiciones.join(' and ');

    const config = await configModulo();
    const nombres = new Map(config.solicitud.tipos.map((t) => [t.slug, t.nombre]));
    const [filas, total, conteo] = await Promise.all([
      pool.query<{
        id: string; numero: string; tipo: string; estado: EstadoSolicitud; email: string; titular: string | null;
        identificador: string | null; enviada_en: Date | null; updated_at: Date; revisor_nombre: string | null; tomada_en: Date | null; abiertas: number;
      }>(
        `select s.id, s.numero, s.tipo, s.estado, s.email, s.datos->>'titular' as titular, s.datos->>'identificador' as identificador,
                s.enviada_en, s.updated_at, s.revisor_nombre, s.tomada_en,
                (select count(*)::int from pagos.fito_observaciones o where o.solicitud_id = s.id and o.resuelta_en is null) as abiertas
           from pagos.fito_solicitudes s where ${where}
          order by case s.estado when 'enviada' then 0 when 'en_revision' then 1 else 2 end, s.enviada_en nulls last, s.updated_at desc
          limit ${limite} offset ${desde}`,
        valores,
      ),
      pool.query<{ n: number }>(`select count(*)::int as n from pagos.fito_solicitudes s where ${where}`, valores),
      pool.query<{ estado: EstadoSolicitud; n: number }>(
        "select estado, count(*)::int as n from pagos.fito_solicitudes where estado <> 'borrador' group by estado",
      ),
    ]);

    const body: SolicitudesPanelResponse = {
      total: total.rows[0].n,
      porEstado: Object.fromEntries(conteo.rows.map((r) => [r.estado, r.n])),
      filas: filas.rows.map(
        (f): SolicitudResumenPanel => ({
          id: f.id,
          numero: f.numero,
          tipo: f.tipo,
          tipoNombre: nombres.get(f.tipo) ?? f.tipo,
          estado: f.estado,
          titular: f.titular,
          identificador: f.identificador,
          email: f.email,
          enviadaEn: f.enviada_en?.toISOString() ?? null,
          actualizadaEn: f.updated_at.toISOString(),
          revisorNombre: f.revisor_nombre,
          tomadaEn: f.tomada_en?.toISOString() ?? null,
          observacionesAbiertas: f.abiertas,
        }),
      ),
    };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

panelRouter.get('/solicitudes/:id', lectura, async (req, res, next) => {
  try {
    const s = await solicitudPorId(String(req.params.id));
    if (!s || s.estado === 'borrador') throw new ErrorSolicitud(404, 'La solicitud no existe.');
    const [base, docs, hist] = await Promise.all([
      solicitudPublica(s),
      documentos(s.id, { incluirReemplazados: true }),
      historial(s.id, { conEmail: true }),
    ]);
    const puedeEditar = req.sesionPanel!.modulos.find((m) => m.slug === MODULO)?.puedeEditar ?? false;
    const { puedeEditar: _p, documentos: _d, ...resto } = base;
    const body: SolicitudPanel = {
      ...resto,
      historial: hist,
      id: s.id,
      revisorNombre: s.revisor_nombre,
      tomada: s.tomada_en ? { nombre: s.revisor_nombre, email: s.revisor_email, fecha: s.tomada_en.toISOString() } : null,
      resuelta:
        s.resuelta_en && s.resuelta_por_id
          ? { nombre: s.resuelta_por_nombre, email: s.resuelta_por_email, fecha: s.resuelta_en.toISOString() }
          : null,
      documentos: await Promise.all(
        docs.map(async (d) => ({ ...documentoPublico(d), reemplazado: !!d.reemplazado_en, url: await enlaceFirmado(BUCKET, d.ruta, 600) })),
      ),
      acciones: puedeEditar ? accionesPorEstado[s.estado] ?? [] : [],
    };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

/** Tomar la revisión: avisa a los demás técnicos que alguien ya la está mirando. */
panelRouter.post('/solicitudes/:id/tomar', edicion, async (req, res, next) => {
  try {
    const yo = quien(req);
    await enTransaccion(async (client) => {
      const s = await bloquear(client, String(req.params.id));
      exigirAccion(s, 'tomar');
      await cambiarEstado(client, s, 'en_revision', { actor: 'tecnico', ...yo }, tomadaPor(yo));
      await auditar(client, req, 'tomar', s, { estado: 'en_revision' });
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

panelRouter.post('/solicitudes/:id/aprobar', edicion, async (req, res, next) => {
  try {
    const yo = quien(req);
    const nota = String(req.body?.nota ?? '').trim().slice(0, 2000) || null;
    const { aprobacionDias = 30 } = (await configModulo()).solicitud;
    const s = await enTransaccion(async (client) => {
      const s = await bloquear(client, String(req.params.id));
      exigirAccion(s, 'aprobar');
      await cambiarEstado(
        client, s, 'aprobada', { actor: 'tecnico', ...yo, nota },
        {
          ...tomarSiFalta(s, yo),
          ...resueltaPor(yo),
          aprobacion_vence: new Date(Date.now() + aprobacionDias * 86_400_000).toISOString().slice(0, 10),
        },
      );
      await auditar(client, req, 'aprobar', s, { estado: 'aprobada', nota });
      return s;
    });
    await avisar({
      para: s.email,
      asunto: `Solicitud ${s.numero}: aprobada`,
      titulo: '¡Tu solicitud fue aprobada!',
      parrafos: [
        `Los técnicos revisaron la solicitud ${s.numero} y está todo en orden.`,
        ...(nota ? [`Nota del área: ${nota}`] : []),
        `Ya podés continuar con el pago de la tasa. Tenés ${aprobacionDias} días; después de ese plazo la aprobación vence.`,
      ],
      boton: { texto: 'Continuar con el pago', url: await enlaceDeSolicitud(s.id) },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

panelRouter.post('/solicitudes/:id/observar', edicion, async (req, res, next) => {
  try {
    const yo = quien(req);
    const lista = Array.isArray(req.body?.observaciones) ? req.body.observaciones : [];
    const observaciones = lista
      .map((o: { requisito?: unknown; texto?: unknown }) => ({
        requisito: typeof o.requisito === 'string' && o.requisito ? o.requisito : null,
        texto: String(o.texto ?? '').trim().slice(0, 2000),
      }))
      .filter((o: { texto: string }) => o.texto);
    if (!observaciones.length) throw new ErrorSolicitud(400, 'Escribí al menos una observación.');

    const s0 = await solicitudPorId(String(req.params.id));
    if (!s0) throw new ErrorSolicitud(404, 'La solicitud no existe.');
    const { tipo } = await solicitudPublica(s0);
    const etiquetas = new Map(tipo.requisitos.map((r) => [r.clave, r.etiqueta]));
    if (observaciones.some((o: { requisito: string | null }) => o.requisito && !etiquetas.has(o.requisito))) {
      throw new ErrorSolicitud(400, 'Una observación apunta a un requisito que no existe.');
    }

    const s = await enTransaccion(async (client) => {
      const s = await bloquear(client, s0.id);
      exigirAccion(s, 'observar');
      for (const o of observaciones) {
        await client.query(
          'insert into pagos.fito_observaciones (solicitud_id, requisito, texto, autor_id, autor_nombre, autor_email) values ($1, $2, $3, $4, $5, $6)',
          [s.id, o.requisito, o.texto, yo.id, yo.nombre, yo.email],
        );
      }
      await cambiarEstado(client, s, 'observada', { actor: 'tecnico', ...yo, nota: `${observaciones.length} observación(es).` }, tomarSiFalta(s, yo));
      await auditar(client, req, 'observar', s, { estado: 'observada', observaciones });
      return s;
    });
    await avisar({
      para: s.email,
      asunto: `Solicitud ${s.numero}: hay que corregir algunas cosas`,
      titulo: 'Tu solicitud tiene observaciones',
      parrafos: [
        `Los técnicos revisaron la solicitud ${s.numero} y necesitan que corrijas lo siguiente:`,
        ...observaciones.map((o: { requisito: string | null; texto: string }) => `• ${o.requisito ? `${etiquetas.get(o.requisito)}: ` : ''}${o.texto}`),
        'Entrá con tu enlace, corregí lo indicado y volvé a enviarla.',
      ],
      boton: { texto: 'Corregir la solicitud', url: await enlaceDeSolicitud(s.id) },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

panelRouter.post('/solicitudes/:id/rechazar', edicion, async (req, res, next) => {
  try {
    const yo = quien(req);
    const motivo = String(req.body?.motivo ?? '').trim().slice(0, 2000);
    if (!motivo) throw new ErrorSolicitud(400, 'Indicá el motivo del rechazo: se le envía a la persona.');
    const s = await enTransaccion(async (client) => {
      const s = await bloquear(client, String(req.params.id));
      exigirAccion(s, 'rechazar');
      await cambiarEstado(
        client, s, 'rechazada', { actor: 'tecnico', ...yo, nota: motivo },
        { ...tomarSiFalta(s, yo), ...resueltaPor(yo), motivo_rechazo: motivo },
      );
      await auditar(client, req, 'rechazar', s, { estado: 'rechazada', motivo });
      return s;
    });
    await avisar({
      para: s.email,
      asunto: `Solicitud ${s.numero}: rechazada`,
      titulo: 'Tu solicitud fue rechazada',
      parrafos: [
        `Los técnicos revisaron la solicitud ${s.numero} y no pudo aprobarse.`,
        `Motivo: ${motivo}`,
        'Si tenés dudas, comunicate con el Departamento de Control Ambiental. Podés iniciar una solicitud nueva cuando quieras.',
      ],
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
