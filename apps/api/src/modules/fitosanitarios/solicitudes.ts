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
import { emailCanonico } from '../../core/verificacion.js';

export const MODULO = 'fitosanitarios';
export const BUCKET = 'fitosanitarios';
export const PROPOSITO_CODIGO = 'fitosanitarios:solicitud';
export const PROPOSITO_RECUPERAR = 'fitosanitarios:recuperar';

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
  tipo_solicitud: 'alta' | 'renovacion';
  email_canonico: string | null;
  /** Referencias a Ecodatos (sin FK entre esquemas). */
  titular_id: string | null;
  registro_id: string | null;
  renueva_certificado_id: string | null;
  certificado_id: string | null;
  vinculo_id: number | null;
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
      where modulo_slug = $1 and concepto = $2 and vigente_desde <= ${SQL_HOY}
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

// --- Enlace privado y sesión ---------------------------------------------------------------------
// El mail lleva un enlace de UN SOLO USO (32 bytes al azar, en el fragmento `#`, así no llega a los
// logs ni al Referer). Al canjearlo (`POST /sesion`) la API abre una sesión con una cookie
// HttpOnly y el enlace deja de servir. La sesión vence por inactividad y por antigüedad máxima.
// En la base queda solo el hash del enlace y de la cookie: no se puede reenviar uno viejo.

const minutosDe = (valor: string | undefined, porDefecto: number) => (Number(valor) > 0 ? Number(valor) : porDefecto);
/** Plazo para canjear el enlace de "recuperar": la persona está esperando el mail en pantalla. */
export const ENLACE_SESION = { ventanaMin: minutosDe(process.env.ENLACE_RECUPERAR_MINUTOS, 15) };
/** Plazo para canjear el enlace del mail de inicio: es para volver más tarde, y la persona ya entró por su sesión. */
export const ENLACE_INICIO = { ventanaMin: minutosDe(process.env.ENLACE_INICIO_MINUTOS, 24 * 60) };
/** Plazo para canjear un enlace de aviso del panel: no sabemos cuándo lo van a leer. */
export const ENLACE_AVISO = { ventanaMin: minutosDe(process.env.ENLACE_AVISO_MINUTOS, 30 * 24 * 60) };
export type OpcionesEnlace = { ventanaMin: number };
/** Una sesión se cierra tras tantos minutos sin usarla... */
export const SESION_INACTIVIDAD_MINUTOS = minutosDe(process.env.SESION_INACTIVIDAD_MINUTOS, 30);
/** ...y, usándola siempre, a los tantos minutos de abierta. */
export const SESION_MAXIMO_MINUTOS = minutosDe(process.env.SESION_MAXIMO_MINUTOS, 240);

/** "15 minutos", "24 horas", "30 días". */
export function textoDuracion(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} ${min === 1440 ? 'día' : 'días'}`;
  if (min % 60 === 0 && min >= 60) return `${min / 60} ${min === 60 ? 'hora' : 'horas'}`;
  return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
}

/** La fecha de hoy en Argentina: los plazos (`aprobacion_vence` es un `date`) vencen a medianoche de allá, no de UTC. */
export const SQL_HOY = `(now() at time zone 'America/Argentina/Buenos_Aires')::date`;
/** Estado "efectivo": una aprobación con el plazo de pago pasado cuenta como `vencida` aunque el estado guardado no se haya actualizado todavía. */
export const sqlEstadoEfectivo = (alias = '') =>
  `case when ${alias}estado = 'aprobada' and ${alias}aprobacion_vence < ${SQL_HOY} then 'vencida' else ${alias}estado end`;

/**
 * ÚNICA definición de qué solicitudes admiten un enlace (recuperar, continuar y avisos). Se calcula
 * contra la fecha del servidor: una aprobación con el plazo de pago vencido no admite enlace aunque
 * su estado guardado siga siendo `aprobada` (el estado `vencida` se guarda recién cuando alguien la abre).
 */
export const SQL_ADMITE_ENLACE = `estado not in ('rechazada','vencida') and not (estado = 'aprobada' and aprobacion_vence < ${SQL_HOY})`;
/** "En curso": admite enlace y todavía no se emitió el certificado (es lo que se lista al iniciar otra). */
export const SQL_EN_CURSO = `${SQL_ADMITE_ENLACE} and estado <> 'emitida'`;

export const nuevoToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const tokenConFormato = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

export function enlaceSolicitud(token: string) {
  const web = (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  // El token va en el fragmento (#): el navegador no lo manda al servidor ni en el Referer.
  return `${web}/pagar/fitosanitarios/solicitud#${token}`;
}

/**
 * Crea un enlace nuevo para la solicitud. NO vence los anteriores: eso se hace recién cuando el mail
 * con el enlace nuevo salió (`vencerAnteriores`), para no dejar a la persona sin enlace si el mail falla.
 */
export async function emitirToken(solicitudId: string, db: Pick<PoolClient, 'query'> = pool, op: OpcionesEnlace = ENLACE_SESION): Promise<string> {
  const token = nuevoToken();
  await db.query("delete from pagos.fito_enlaces where expira_en < now() - interval '1 day'");
  await db.query(
    `insert into pagos.fito_enlaces (solicitud_id, token_hash, expira_en) values ($1, $2, now() + make_interval(mins => $3))`,
    [solicitudId, hashToken(token), op.ventanaMin],
  );
  return token;
}

/**
 * Vence los enlaces sin usar de la solicitud que se emitieron **antes** que `token`. Se ordena por
 * `seq` (no por fecha: dos emisiones en el mismo instante empatarían) y no es "todos los demás":
 * si dos mails salen en paralelo, el que termina último no debe matar al más nuevo.
 */
export async function vencerAnteriores(solicitudId: string, token: string, db: Pick<PoolClient, 'query'> = pool) {
  await db.query(
    `update pagos.fito_enlaces set expira_en = now()
      where solicitud_id = $1 and usado_en is null and expira_en > now() and token_hash <> $2
        and seq < (select seq from pagos.fito_enlaces where token_hash = $2)`,
    [solicitudId, hashToken(token)],
  );
}

/** ¿El enlace sigue sin usar y dentro de su plazo? (se chequea justo antes de mandar el mail) */
export async function enlaceVigente(token: string): Promise<boolean> {
  const { rowCount } = await pool.query('select 1 from pagos.fito_enlaces where token_hash = $1 and usado_en is null and expira_en > now()', [hashToken(token)]);
  return !!rowCount;
}

/** Descarta un enlace recién emitido (si el mail no salió). */
export async function descartarToken(token: string) {
  await pool.query('update pagos.fito_enlaces set expira_en = now() where token_hash = $1', [hashToken(token)]);
}

/**
 * Manda un aviso con un enlace nuevo. Los enlaces anteriores solo se vencen si el mail salió; si
 * falla, el nuevo se descarta y la persona conserva el que tenía. Si mientras tanto otro enlace más
 * nuevo ya venció a este, no se manda un mail con un enlace muerto.
 */
export async function avisarConEnlace(solicitudId: string, op: OpcionesEnlace, armar: (url: string) => Parameters<typeof plantilla>[0]): Promise<boolean> {
  const token = await emitirToken(solicitudId, pool, op);
  if (!(await enlaceVigente(token))) return false;
  if (await avisar(armar(enlaceSolicitud(token)))) {
    await vencerAnteriores(solicitudId, token);
    return true;
  }
  await descartarToken(token);
  return false;
}

export interface ContextoCliente {
  ip?: string | null;
  userAgent?: string | null;
}

/** Abre una sesión para la solicitud y devuelve el valor de la cookie. Cierra las sesiones anteriores de esa solicitud. */
export async function abrirSesion(solicitudId: string, ctx: ContextoCliente = {}, db: Pick<PoolClient, 'query'> = pool): Promise<string> {
  const valor = randomBytes(32).toString('base64url');
  await db.query("delete from pagos.fito_sesiones where ultimo_uso < now() - interval '1 day'");
  await db.query('delete from pagos.fito_sesiones where solicitud_id = $1', [solicitudId]);
  await db.query('insert into pagos.fito_sesiones (solicitud_id, cookie_hash, ip, user_agent) values ($1, $2, $3, $4)', [
    solicitudId,
    hashToken(valor),
    ctx.ip ?? null,
    (ctx.userAgent ?? '').slice(0, 300) || null,
  ]);
  return valor;
}

export type ResultadoCanje = { cookie: string } | { motivo: 'usado'; usadoEn: Date } | { motivo: 'invalido' };

/** Canjea un enlace (una sola vez). Si no vale, dice si ya se había usado (y cuándo) o si es inválido/vencido. */
export async function canjearEnlace(token: string, ctx: ContextoCliente = {}): Promise<ResultadoCanje> {
  if (!tokenConFormato(token)) return { motivo: 'invalido' };
  const cookie = await enTransaccion(async (client) => {
    const { rows } = await client.query<{ solicitud_id: string }>(
      `update pagos.fito_enlaces set usado_en = now()
        where token_hash = $1 and usado_en is null and expira_en > now() returning solicitud_id`,
      [hashToken(token)],
    );
    return rows[0] ? abrirSesion(rows[0].solicitud_id, ctx, client) : null;
  });
  if (cookie) return { cookie };
  // La única señal que tiene la persona de que alguien más usó un enlace reenviado es saber cuándo se usó.
  const { rows } = await pool.query<{ usado_en: Date }>('select usado_en from pagos.fito_enlaces where token_hash = $1 and usado_en is not null', [hashToken(token)]);
  return rows[0] ? { motivo: 'usado', usadoEn: rows[0].usado_en } : { motivo: 'invalido' };
}

/** La solicitud de una sesión vigente (y la renueva por inactividad), o null. */
export async function solicitudPorSesion(cookie: string): Promise<FilaSolicitud | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(cookie)) return null;
  const { rows: sesiones } = await pool.query<{ solicitud_id: string }>(
    `update pagos.fito_sesiones set ultimo_uso = now()
      where cookie_hash = $1
        and ultimo_uso > now() - make_interval(mins => $2)
        and created_at > now() - make_interval(mins => $3)
      returning solicitud_id`,
    [hashToken(cookie), SESION_INACTIVIDAD_MINUTOS, SESION_MAXIMO_MINUTOS],
  );
  if (!sesiones[0]) return null;
  const { rows } = await pool.query<FilaSolicitud>(`select ${columnas} from pagos.fito_solicitudes where id = $1`, [sesiones[0].solicitud_id]);
  return rows[0] ? aplicarVencimiento(rows[0]) : null;
}

export const PROPOSITO_PERSONA = 'fitosanitarios:persona';

/** Abre una sesión de PERSONA (atada al mail verificado, no a una solicitud). Cierra las anteriores de esa casilla. */
export async function abrirSesionPersona(email: string, ctx: ContextoCliente = {}): Promise<string> {
  const valor = randomBytes(32).toString('base64url');
  const canonico = emailCanonico(email);
  await pool.query("delete from pagos.fito_sesiones where ultimo_uso < now() - interval '1 day'");
  await pool.query('delete from pagos.fito_sesiones where solicitud_id is null and email_canonico = $1', [canonico]);
  await pool.query(
    'insert into pagos.fito_sesiones (solicitud_id, email, email_canonico, cookie_hash, ip, user_agent) values (null, $1, $2, $3, $4, $5)',
    [email, canonico, hashToken(valor), ctx.ip ?? null, (ctx.userAgent ?? '').slice(0, 300) || null],
  );
  return valor;
}

export interface PersonaSesion {
  email: string;
  emailCanonico: string;
}

/**
 * La persona (mail) de una sesión vigente, sea de persona o de una solicitud: en los dos casos la
 * cookie prueba que controla esa casilla. La renueva por inactividad. Null si no hay sesión.
 */
export async function personaPorSesion(cookie: string): Promise<PersonaSesion | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(cookie)) return null;
  const { rows } = await pool.query<{ solicitud_id: string | null; email: string | null }>(
    `update pagos.fito_sesiones set ultimo_uso = now()
      where cookie_hash = $1
        and ultimo_uso > now() - make_interval(mins => $2)
        and created_at > now() - make_interval(mins => $3)
      returning solicitud_id, email`,
    [hashToken(cookie), SESION_INACTIVIDAD_MINUTOS, SESION_MAXIMO_MINUTOS],
  );
  if (!rows[0]) return null;
  let email = rows[0].email;
  if (rows[0].solicitud_id) {
    const r = await pool.query<{ email: string }>('select email from pagos.fito_solicitudes where id = $1', [rows[0].solicitud_id]);
    email = r.rows[0]?.email ?? null;
  }
  return email ? { email, emailCanonico: emailCanonico(email) } : null;
}

/** Cierra la sesión de esa cookie. */
export async function cerrarSesion(cookie: string) {
  await pool.query('delete from pagos.fito_sesiones where cookie_hash = $1', [hashToken(cookie)]);
}

// --- Lectura -------------------------------------------------------------------------------------

const columnas = `id, numero, tipo, estado, email, datos, revisor_id, revisor_nombre, revisor_email, tomada_en, enviada_en,
  resuelta_en, resuelta_por_id, resuelta_por_nombre, resuelta_por_email, aprobacion_vence::text, motivo_rechazo,
  tipo_solicitud, email_canonico, titular_id, registro_id, renueva_certificado_id, certificado_id, vinculo_id, created_at, updated_at`;

/** Si la aprobación venció sin pago, la solicitud pasa a `vencida` al leerla. */
async function aplicarVencimiento(s: FilaSolicitud): Promise<FilaSolicitud> {
  if (s.estado !== 'aprobada' || !s.aprobacion_vence) return s;
  const { rows } = await pool.query<{ vencida: boolean }>(`select $1::date < ${SQL_HOY} as vencida`, [s.aprobacion_vence]);
  if (!rows[0].vencida) return s;
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Con la fila bloqueada: dos lecturas simultáneas no duplican la entrada del historial.
    const vigente = await client.query("select 1 from pagos.fito_solicitudes where id = $1 and estado = 'aprobada' for update", [s.id]);
    if (vigente.rowCount) await cambiarEstado(client, s, 'vencida', { actor: 'sistema', nota: 'La aprobación venció sin que se hiciera el pago.' });
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return { ...s, estado: 'vencida' };
}


/** Una solicitud por su número, solo si es de esa casilla (sesión de persona). */
export async function solicitudDeLaPersona(canonico: string, numero: string): Promise<FilaSolicitud | null> {
  const { rows } = await pool.query<FilaSolicitud>(`select ${columnas} from pagos.fito_solicitudes where numero = $1 and email_canonico = $2`, [numero, canonico]);
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
  vence_en: string | null;
  reemplazado_en: Date | null;
  created_at: Date;
}

export async function documentos(id: string, { incluirReemplazados = false } = {}): Promise<FilaDocumento[]> {
  const { rows } = await pool.query<FilaDocumento>(
    `select id::int, requisito, ruta, nombre, tipo_mime, bytes, vence_en::text, reemplazado_en, created_at
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
  venceEn: d.vence_en,
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
    pendientes: requisitosPendientes(
      tipo.requisitos,
      s.datos,
      docs.map((d) => d.requisito),
      docs.filter((d) => !d.vence_en).map((d) => d.requisito),
    ),
    puedeEditar: estadosEditables.includes(s.estado),
    tipoSolicitud: s.tipo_solicitud,
    renuevaCertificadoId: s.renueva_certificado_id,
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
  // Rechazada o vencida: el enlace ya no sirve para nada, no hace falta que siga vigente.
  if (nuevo === 'rechazada' || nuevo === 'vencida') {
    await client.query('update pagos.fito_enlaces set expira_en = now() where solicitud_id = $1 and expira_en > now()', [s.id]);
  }
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

export async function avisar(mail: Parameters<typeof plantilla>[0]): Promise<boolean> {
  try {
    await enviarCorreo(plantilla(mail));
    return true;
  } catch (e) {
    console.error(`No se pudo enviar el mail "${mail.asunto}": ${(e as Error).message}`);
    return false;
  }
}

export const nombreTramite = 'certificado de fitosanitarios y domisanitarios';
