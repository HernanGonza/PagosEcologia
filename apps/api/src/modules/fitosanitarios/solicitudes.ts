/**
 * Lógica de las solicitudes de fitosanitarios, compartida por la parte pública y el panel.
 * Los tipos y requisitos salen de `pagos.modulos.config.solicitud` (ver 0005).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  estadosEditables,
  requisitosDeTipo,
  requisitosPendientes,
  type CalculoMonto,
  type ConfigSolicitud,
  type DocumentoSolicitud,
  type EstadoSolicitud,
  type HistorialSolicitud,
  type ObservacionSolicitud,
  type SolicitudPublica,
  type TipoSolicitudPublico,
} from '@botonera/shared';
import { pool } from '../../db.js';
import { enviarCorreo, plantilla } from '../../core/correo.js';
import { descifrar } from '../../core/secretos.js';

export const MODULO = 'fitosanitarios';
export const BUCKET = 'fitosanitarios';
export const PROPOSITO_CODIGO = 'fitosanitarios:solicitud';

export class ErrorSolicitud extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

export interface FilaSolicitud {
  id: string;
  numero: string;
  tipo: string;
  estado: EstadoSolicitud;
  email: string;
  datos: Record<string, string>;
  /** Quien tomó la revisión. */
  revisor_id: string | null;
  revisor_nombre: string | null;
  revisor_email: string | null;
  tomada_en: Date | null;
  enviada_en: Date | null;
  /** Quien la aprobó o rechazó (puede no ser quien la tomó). */
  resuelta_en: Date | null;
  resuelta_por_id: string | null;
  resuelta_por_nombre: string | null;
  resuelta_por_email: string | null;
  aprobacion_vence: string | null;
  motivo_rechazo: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ConfigModuloFito {
  solicitud: ConfigSolicitud;
  monto: CalculoMonto;
}

export async function configModulo(): Promise<ConfigModuloFito> {
  const { rows } = await pool.query<{ config: ConfigModuloFito }>('select config from pagos.modulos where slug = $1', [MODULO]);
  const config = rows[0]?.config;
  if (!config?.solicitud?.tipos?.length) throw new ErrorSolicitud(503, 'Los tipos de certificado todavía no están configurados.');
  return config;
}

/** Importe vigente (centavos) del concepto que corresponde al tipo, o null si no hay tarifa cargada. */
async function importeDeTipo(monto: CalculoMonto, tipo: string): Promise<number | null> {
  const concepto = monto.tipo === 'segun-opcion' ? monto.conceptos[tipo] : monto.tipo === 'fijo' ? monto.concepto : undefined;
  if (!concepto) return null;
  const { rows } = await pool.query<{ valor: unknown }>(
    `select valor from pagos.tarifas
      where modulo_slug = $1 and concepto = $2 and vigente_desde <= current_date
      order by vigente_desde desc, id desc limit 1`,
    [MODULO, concepto],
  );
  return typeof rows[0]?.valor === 'number' ? rows[0].valor : null;
}

export async function tiposPublicos(): Promise<TipoSolicitudPublico[]> {
  const config = await configModulo();
  return Promise.all(config.solicitud.tipos.map((t) => tipoPublico(config, t.slug)));
}

export async function tipoPublico(config: ConfigModuloFito, slug: string): Promise<TipoSolicitudPublico> {
  const tipo = config.solicitud.tipos.find((t) => t.slug === slug);
  if (!tipo) throw new ErrorSolicitud(400, 'Ese tipo de certificado no existe.');
  return {
    slug: tipo.slug,
    nombre: tipo.nombre,
    descripcion: tipo.descripcion ?? null,
    requisitos: requisitosDeTipo(config.solicitud, tipo),
    importeCentavos: await importeDeTipo(config.monto, tipo.slug),
  };
}

// --- Enlace privado ------------------------------------------------------------------------------
// 32 bytes aleatorios: imposible de adivinar. Se busca por hash y se guarda cifrado para
// poder mandarlo en los avisos (ver core/secretos.ts).

export const nuevoToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const tokenConFormato = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

export function enlaceSolicitud(token: string) {
  const web = (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  return `${web}/pagar/fitosanitarios/solicitud/${token}`;
}

/** Enlace de una solicitud ya creada, para los avisos que se mandan después. */
export async function enlaceDeSolicitud(id: string): Promise<string> {
  const { rows } = await pool.query<{ token_cifrado: string }>('select token_cifrado from pagos.fito_solicitudes where id = $1', [id]);
  return enlaceSolicitud(descifrar(rows[0].token_cifrado));
}

// --- Lectura -------------------------------------------------------------------------------------

const columnas = `id, numero, tipo, estado, email, datos, revisor_id, revisor_nombre, revisor_email, tomada_en, enviada_en,
  resuelta_en, resuelta_por_id, resuelta_por_nombre, resuelta_por_email, aprobacion_vence::text, motivo_rechazo, created_at, updated_at`;

/** Si la aprobación venció sin pago, la solicitud pasa a `vencida` al leerla. */
async function aplicarVencimiento(s: FilaSolicitud): Promise<FilaSolicitud> {
  if (s.estado !== 'aprobada' || !s.aprobacion_vence) return s;
  const { rows } = await pool.query<{ vencida: boolean }>('select $1::date < current_date as vencida', [s.aprobacion_vence]);
  if (!rows[0].vencida) return s;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await cambiarEstado(client, s, 'vencida', { actor: 'sistema', nota: 'La aprobación venció sin que se hiciera el pago.' });
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return { ...s, estado: 'vencida' };
}

export async function solicitudPorToken(token: string): Promise<FilaSolicitud | null> {
  if (!tokenConFormato(token)) return null;
  const { rows } = await pool.query<FilaSolicitud>(`select ${columnas} from pagos.fito_solicitudes where token_hash = $1`, [hashToken(token)]);
  return rows[0] ? aplicarVencimiento(rows[0]) : null;
}

export async function solicitudPorId(id: string): Promise<FilaSolicitud | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await pool.query<FilaSolicitud>(`select ${columnas} from pagos.fito_solicitudes where id = $1`, [id]);
  return rows[0] ? aplicarVencimiento(rows[0]) : null;
}

/** Bloquea la fila para cambiar su estado dentro de una transacción. */
export async function bloquear(client: PoolClient, id: string): Promise<FilaSolicitud> {
  const { rows } = await client.query<FilaSolicitud>(`select ${columnas} from pagos.fito_solicitudes where id = $1 for update`, [id]);
  if (!rows[0]) throw new ErrorSolicitud(404, 'La solicitud no existe.');
  return rows[0];
}

export interface FilaDocumento {
  id: number;
  requisito: string;
  ruta: string;
  nombre: string;
  tipo_mime: string;
  bytes: number;
  reemplazado_en: Date | null;
  created_at: Date;
}

export async function documentos(id: string, { incluirReemplazados = false } = {}): Promise<FilaDocumento[]> {
  const { rows } = await pool.query<FilaDocumento>(
    `select id::int, requisito, ruta, nombre, tipo_mime, bytes, reemplazado_en, created_at
       from pagos.fito_documentos where solicitud_id = $1 ${incluirReemplazados ? '' : 'and reemplazado_en is null'}
      order by created_at`,
    [id],
  );
  return rows;
}

export const documentoPublico = (d: FilaDocumento): DocumentoSolicitud => ({
  id: d.id,
  requisito: d.requisito,
  nombre: d.nombre,
  tipoMime: d.tipo_mime,
  bytes: d.bytes,
  subidoEn: d.created_at.toISOString(),
});

export async function observaciones(id: string): Promise<ObservacionSolicitud[]> {
  const { rows } = await pool.query<{ id: number; requisito: string | null; texto: string; autor_nombre: string | null; created_at: Date; resuelta_en: Date | null }>(
    `select id::int, requisito, texto, autor_nombre, created_at, resuelta_en
       from pagos.fito_observaciones where solicitud_id = $1 order by created_at`,
    [id],
  );
  return rows.map((o) => ({
    id: o.id,
    requisito: o.requisito,
    texto: o.texto,
    autor: o.autor_nombre,
    creadaEn: o.created_at.toISOString(),
    resuelta: !!o.resuelta_en,
  }));
}

/** Con `conEmail` (solo el panel) incluye el mail de cada técnico; la persona ve solo los nombres. */
export async function historial(id: string, { conEmail = false } = {}): Promise<HistorialSolicitud[]> {
  const { rows } = await pool.query<{ estado_nuevo: EstadoSolicitud; estado_anterior: EstadoSolicitud | null; actor: HistorialSolicitud['actor']; actor_nombre: string | null; actor_email: string | null; nota: string | null; created_at: Date }>(
    `select estado_nuevo, estado_anterior, actor, actor_nombre, actor_email, nota, created_at
       from pagos.fito_historial where solicitud_id = $1 order by created_at, id`,
    [id],
  );
  return rows.map((h) => ({
    estado: h.estado_nuevo,
    anterior: h.estado_anterior,
    actor: h.actor,
    actorNombre: h.actor_nombre,
    ...(conEmail ? { actorEmail: h.actor_email } : {}),
    nota: h.nota,
    fecha: h.created_at.toISOString(),
  }));
}

/** Lo que ve la persona con su enlace (y la base del detalle del panel). */
export async function solicitudPublica(s: FilaSolicitud): Promise<SolicitudPublica> {
  const config = await configModulo();
  const [tipo, docs, obs, hist] = await Promise.all([tipoPublico(config, s.tipo), documentos(s.id), observaciones(s.id), historial(s.id)]);
  return {
    numero: s.numero,
    estado: s.estado,
    email: s.email,
    tipo,
    datos: s.datos,
    documentos: docs.map(documentoPublico),
    observaciones: obs,
    historial: hist,
    pendientes: requisitosPendientes(tipo.requisitos, s.datos, docs.map((d) => d.requisito)),
    puedeEditar: estadosEditables.includes(s.estado),
    enviadaEn: s.enviada_en?.toISOString() ?? null,
    aprobacionVence: s.aprobacion_vence,
    motivoRechazo: s.motivo_rechazo,
  };
}

// --- Cambios de estado ---------------------------------------------------------------------------

export interface Actor {
  actor: 'solicitante' | 'tecnico' | 'sistema';
  id?: string;
  nombre?: string | null;
  email?: string | null;
  ip?: string | null;
  nota?: string | null;
}

/** Cambia el estado y deja el historial. Se llama dentro de una transacción con la fila bloqueada. */
export async function cambiarEstado(
  client: PoolClient,
  s: Pick<FilaSolicitud, 'id' | 'estado'>,
  nuevo: EstadoSolicitud,
  actor: Actor,
  extra: Record<string, unknown> = {},
) {
  const columnasExtra = Object.keys(extra);
  await client.query(
    `update pagos.fito_solicitudes set estado = $2, updated_at = now()
       ${columnasExtra.map((c, i) => `, ${c} = $${i + 3}`).join('')}
      where id = $1`,
    [s.id, nuevo, ...Object.values(extra)],
  );
  await client.query(
    `insert into pagos.fito_historial (solicitud_id, estado_anterior, estado_nuevo, actor, actor_id, actor_nombre, actor_email, ip, nota)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [s.id, s.estado === nuevo ? null : s.estado, nuevo, actor.actor, actor.id ?? null, actor.nombre ?? null, actor.email ?? null, actor.ip ?? null, actor.nota ?? null],
  );
}

/** Corre `fn` en una transacción. */
export async function enTransaccion<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const r = await fn(client);
    await client.query('commit');
    return r;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

// --- Avisos por mail -----------------------------------------------------------------------------
// Un mail que no sale no deshace el cambio de estado: se registra y la persona igual ve todo
// con su enlace.

export async function avisar(mail: Parameters<typeof plantilla>[0]) {
  try {
    await enviarCorreo(plantilla(mail));
  } catch (e) {
    console.error(`No se pudo enviar el mail "${mail.asunto}": ${(e as Error).message}`);
  }
}

export const nombreTramite = 'certificado de fitosanitarios y domisanitarios';
