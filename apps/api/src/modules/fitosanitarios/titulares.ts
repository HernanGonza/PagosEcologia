/**
 * Titulares, vínculos mail ↔ titular, objetos registrados y certificados.
 * El registro vive en Ecodatos (`public`, migración 0010); la solicitud y los pagos en `pagos`.
 * Ver apps/api/src/modules/fitosanitarios/docs/titulares-y-certificados.md.
 */
import type { PoolClient } from 'pg';
import {
  cuitValido,
  renovacionPorDefecto,
  type CertificadoVista,
  type ConfigRenovacion,
  type EstadoCertificado,
  type EstadoObjeto,
  type ObjetoVista,
  type TitularFicha,
  type TitularResumen,
  type VinculoVista,
} from '@botonera/shared';
import { pool } from '../../db.js';
import { emailCanonico } from '../../core/verificacion.js';
import { ErrorSolicitud, configModulo, type FilaSolicitud } from './solicitudes.js';

// --- DNI / CUIT ------------------------------------------------------------------------------------

export const soloDigitos = (v: string | undefined | null) => (v ?? '').replace(/\D/g, '');

export interface Documento {
  dni: string | null;
  cuit: string | null;
  tipoPersona: 'fisica' | 'juridica';
}

/**
 * Normaliza lo que la persona escribió. Un CUIT/CUIL de persona física contiene el DNI
 * (`20-DNI-x`), así que se deriva para poder buscar por cualquiera de los dos.
 */
export function clasificarDocumento(valor: string | undefined | null): Documento | null {
  const d = soloDigitos(valor);
  if (/^\d{7,8}$/.test(d)) return { dni: d, cuit: null, tipoPersona: 'fisica' };
  if (cuitValido(d)) {
    const juridica = ['30', '33', '34'].includes(d.slice(0, 2));
    return { dni: juridica ? null : d.slice(2, 10).replace(/^0+/, '').padStart(7, '0'), cuit: d, tipoPersona: juridica ? 'juridica' : 'fisica' };
  }
  return null;
}

// --- Alta del titular y vínculo (al aprobar) ------------------------------------------------------

export interface QuienAprueba {
  id: string;
  nombre: string | null;
}

/**
 * Busca el titular por DNI o CUIT (cualquiera de los dos) o lo crea. Si lo encuentra y le faltaba el
 * otro número, lo completa. No pisa nombre, teléfono ni domicilio de un titular existente.
 */
export async function buscarOCrearTitular(
  client: PoolClient,
  datos: { identificador?: string; titular?: string; telefono?: string; domicilio?: string },
): Promise<string> {
  const doc = clasificarDocumento(datos.identificador);
  if (!doc) throw new ErrorSolicitud(409, 'El DNI o CUIT de la solicitud no es válido: pedí a la persona que lo corrija antes de aprobar.');
  const { rows } = await client.query<{ id: string; dni: string | null; cuit: string | null }>(
    'select id, dni, cuit from public.fito_titulares where (dni = $1::text) or (cuit = $2::text) for update',
    [doc.dni, doc.cuit],
  );
  if (rows.length > 1) {
    throw new ErrorSolicitud(409, 'Ese DNI y ese CUIT figuran en titulares distintos: hay que unificarlos a mano antes de aprobar.');
  }
  if (rows[0]) {
    const t = rows[0];
    if ((!t.dni && doc.dni) || (!t.cuit && doc.cuit)) {
      await client.query('update public.fito_titulares set dni = coalesce(dni, $2), cuit = coalesce(cuit, $3) where id = $1', [t.id, doc.dni, doc.cuit]);
    }
    return t.id;
  }
  const nombre = (datos.titular ?? '').trim();
  if (!nombre) throw new ErrorSolicitud(409, 'Falta el nombre o razón social del titular.');
  const creado = await client.query<{ id: string }>(
    `insert into public.fito_titulares (tipo_persona, dni, cuit, nombre, telefono, domicilio)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [doc.tipoPersona, doc.dni, doc.cuit, nombre, (datos.telefono ?? '').trim() || null, (datos.domicilio ?? '').trim() || null],
  );
  return creado.rows[0].id;
}

/** Crea el vínculo mail ↔ titular si no hay uno activo (la aprobación de un técnico es la prueba de identidad). */
export async function vincular(client: PoolClient, titularId: string, s: Pick<FilaSolicitud, 'id' | 'email'>, tecnico: QuienAprueba): Promise<number> {
  const canonico = emailCanonico(s.email);
  const existente = await client.query<{ id: number }>(
    'select id from public.fito_vinculos where titular_id = $1 and email_canonico = $2 and baja_en is null',
    [titularId, canonico],
  );
  if (existente.rows[0]) return existente.rows[0].id;
  const { rows } = await client.query<{ id: number }>(
    `insert into public.fito_vinculos (titular_id, email, email_canonico, solicitud_id, aprobado_por, aprobado_por_nombre)
     values ($1, lower($2), $3, $4, $5, $6) returning id`,
    [titularId, s.email, canonico, s.id, tecnico.id, tecnico.nombre],
  );
  return rows[0].id;
}

/**
 * Al aprobar una solicitud: el titular queda creado/identificado y el mail vinculado. En una
 * renovación el titular ya está y solo se verifica que el mail siga vinculado.
 */
export async function aprobarTitularYVinculo(client: PoolClient, s: FilaSolicitud, tecnico: QuienAprueba) {
  let titularId = s.titular_id;
  if (s.tipo_solicitud === 'alta' || !titularId) {
    titularId = await buscarOCrearTitular(client, {
      identificador: s.datos.identificador,
      titular: s.datos.titular,
      telefono: s.datos.telefono,
      domicilio: s.datos.domicilio,
    });
  }
  const vinculoId = await vincular(client, titularId, s, tecnico);
  await client.query('update pagos.fito_solicitudes set titular_id = $2, vinculo_id = $3 where id = $1', [s.id, titularId, vinculoId]);
  return { titularId, vinculoId };
}

// --- Configuración de renovación -------------------------------------------------------------------

export async function configRenovacion(): Promise<ConfigRenovacion> {
  const config = (await configModulo()) as unknown as { renovacion?: Partial<ConfigRenovacion> };
  return { ...renovacionPorDefecto, ...(config.renovacion ?? {}) };
}

// --- Lectura: fichas -------------------------------------------------------------------------------

const iso = (d: Date | null) => (d ? d.toISOString() : null);

interface FilaCert {
  id: string; registro_id: string; numero: string; vigente_desde: string; vence_en: string; emitido_en: Date; estado: EstadoCertificado;
  dias_para_vencer: number; renovado_de: string | null; codigo_verificacion: string; revocado_en: Date | null; revocado_motivo: string | null;
}

const certVista = (c: FilaCert): CertificadoVista => ({
  id: c.id,
  numero: c.numero,
  vigenteDesde: c.vigente_desde,
  venceEn: c.vence_en,
  emitidoEn: c.emitido_en.toISOString(),
  estado: c.estado,
  diasParaVencer: c.dias_para_vencer,
  renovadoDe: c.renovado_de,
  codigoVerificacion: c.codigo_verificacion,
  revocadoEn: iso(c.revocado_en),
  revocadoMotivo: c.revocado_motivo,
});

/** Por qué un objeto no se puede renovar hoy, o null si se puede. */
export function motivoNoRenovar(
  o: { estado: EstadoObjeto; dias: number | null; enCurso: string | null; tieneCertificado: boolean },
  cfg: ConfigRenovacion,
): string | null {
  if (o.estado === 'revocado') return 'El certificado fue revocado.';
  if (!o.tieneCertificado || o.dias === null) return 'Todavía no tiene un certificado emitido.';
  if (o.enCurso) return `Ya hay una renovación en curso (${o.enCurso}).`;
  if (o.dias > cfg.anticipacionDias) return `Se puede renovar desde ${cfg.anticipacionDias} días antes del vencimiento.`;
  if (o.dias < -cfg.graciaDias) return `Pasaron más de ${cfg.graciaDias} días desde el vencimiento: hay que iniciar una solicitud nueva.`;
  return null;
}

/** Objetos (con sus certificados) de un conjunto de titulares. */
async function objetosDe(titularIds: string[]): Promise<Map<string, ObjetoVista[]>> {
  const porTitular = new Map<string, ObjetoVista[]>();
  if (!titularIds.length) return porTitular;
  const cfg = await configRenovacion();
  const [objs, certs, curso] = await Promise.all([
    pool.query<{
      id: string; titular_id: string; nro_registro: string | null; tipo_nombre: string | null; objeto_etiqueta: string | null; fecha_registro: string;
      vence_en: string | null; estado: EstadoObjeto; dias_para_vencer: number | null; vtv_vence_en: string | null; vtv_vencida: boolean;
    }>(
      `select r.id, r.titular_id, r.nro_registro::text, t.nombre as tipo_nombre, r.objeto_etiqueta, r.fecha_registro::text, r.vence_en::text,
              r.estado, r.dias_para_vencer, r.vtv_vence_en::text, r.vtv_vencida
         from public.fito_registro_estado r left join public.tipos_fito_domi t on t.id = r.tipo_id
        where r.titular_id = any($1::uuid[])
        order by r.fecha_registro, r.created_at`,
      [titularIds],
    ),
    pool.query<FilaCert>(
      `select c.id, c.registro_id, c.numero, c.vigente_desde::text, c.vence_en::text, c.emitido_en, c.estado, c.dias_para_vencer,
              c.renovado_de, c.codigo_verificacion, c.revocado_en, c.revocado_motivo
         from public.fito_certificados_estado c where c.titular_id = any($1::uuid[]) order by c.vigente_desde desc, c.emitido_en desc`,
      [titularIds],
    ),
    pool.query<{ renueva_certificado_id: string; numero: string }>(
      `select renueva_certificado_id, numero from pagos.fito_solicitudes
        where renueva_certificado_id is not null and titular_id = any($1::uuid[])
          and estado in ('borrador','enviada','en_revision','observada','aprobada','pagada')`,
      [titularIds],
    ),
  ]);
  const enCurso = new Map(curso.rows.map((r) => [r.renueva_certificado_id, r.numero]));
  const certsPorObjeto = new Map<string, FilaCert[]>();
  for (const c of certs.rows) certsPorObjeto.set(c.registro_id, [...(certsPorObjeto.get(c.registro_id) ?? []), c]);

  for (const o of objs.rows) {
    const lista = certsPorObjeto.get(o.id) ?? [];
    // El actual es el último de la cadena de renovaciones (el que nadie renovó); si fue revocado, no hay.
    const renovados = new Set(lista.map((c) => c.renovado_de).filter(Boolean));
    const ultimo = lista.filter((c) => !renovados.has(c.id)).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0] ?? null;
    const actual = ultimo && ultimo.estado !== 'revocado' ? ultimo : null;
    const enCursoNum = actual ? enCurso.get(actual.id) ?? null : null;
    const motivo = motivoNoRenovar({ estado: o.estado, dias: o.dias_para_vencer, enCurso: enCursoNum, tieneCertificado: !!actual }, cfg);
    const vista: ObjetoVista = {
      id: o.id,
      nroRegistro: o.nro_registro === null ? null : Number(o.nro_registro),
      tipoNombre: o.tipo_nombre,
      etiqueta: o.objeto_etiqueta,
      fechaRegistro: o.fecha_registro,
      venceEn: o.vence_en,
      estado: o.estado,
      diasParaVencer: o.dias_para_vencer,
      vtvVenceEn: o.vtv_vence_en,
      vtvVencida: o.vtv_vencida,
      certificadoActualId: actual?.id ?? null,
      puedeRenovar: motivo === null,
      motivoNoRenovar: motivo,
      renovacionEnCurso: enCursoNum,
      certificados: lista.map(certVista),
    };
    porTitular.set(o.titular_id, [...(porTitular.get(o.titular_id) ?? []), vista]);
  }
  return porTitular;
}

interface FilaTitular {
  id: string; tipo_persona: 'fisica' | 'juridica'; dni: string | null; cuit: string | null; nombre: string; telefono: string | null;
  domicilio: string | null; created_at: Date;
}

const columnasTitular = 'id, tipo_persona, dni, cuit, nombre, telefono, domicilio, created_at';

export async function titularesPorIds(ids: string[]): Promise<(FilaTitular & { objetos: ObjetoVista[] })[]> {
  if (!ids.length) return [];
  const [{ rows }, objetos] = await Promise.all([
    pool.query<FilaTitular>(`select ${columnasTitular} from public.fito_titulares where id = any($1::uuid[]) order by lower(nombre)`, [ids]),
    objetosDe(ids),
  ]);
  return rows.map((t) => ({ ...t, objetos: objetos.get(t.id) ?? [] }));
}

export const solicitudesDeTitular = async (titularId: string, soloEmailCanonico?: string) => {
  const { rows } = await pool.query<{ id: string; numero: string; tipo: string; tipo_solicitud: 'alta' | 'renovacion'; estado: string; enviada_en: Date | null }>(
    `select id, numero, tipo, tipo_solicitud, estado, enviada_en from pagos.fito_solicitudes
      where titular_id = $1 and estado <> 'borrador' ${soloEmailCanonico ? 'and email_canonico = $2' : ''}
      order by created_at desc limit 100`,
    soloEmailCanonico ? [titularId, soloEmailCanonico] : [titularId],
  );
  return rows.map((r) => ({ id: r.id, numero: r.numero, tipo: r.tipo, tipoSolicitud: r.tipo_solicitud, estado: r.estado, enviadaEn: iso(r.enviada_en) }));
};

export async function vinculosDe(titularId: string): Promise<VinculoVista[]> {
  const { rows } = await pool.query<{
    id: string; email: string; aprobado_en: Date; aprobado_por_nombre: string | null; baja_solicitada_en: Date | null;
    baja_solicitada_por: string | null; baja_en: Date | null; baja_por: string | null; baja_motivo: string | null;
  }>(
    `select id::text, email, aprobado_en, aprobado_por_nombre, baja_solicitada_en, baja_solicitada_por, baja_en, baja_por, baja_motivo
       from public.fito_vinculos where titular_id = $1 order by aprobado_en`,
    [titularId],
  );
  return rows.map((v) => ({
    id: Number(v.id),
    email: v.email,
    aprobadoEn: v.aprobado_en.toISOString(),
    aprobadoPor: v.aprobado_por_nombre,
    bajaSolicitadaEn: iso(v.baja_solicitada_en),
    bajaSolicitadaPor: v.baja_solicitada_por,
    bajaEn: iso(v.baja_en),
    bajaPor: v.baja_por,
    bajaMotivo: v.baja_motivo,
  }));
}

/** Ficha completa (panel de técnicos). */
export async function fichaTitular(id: string): Promise<TitularFicha | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [t] = await titularesPorIds([id]);
  if (!t) return null;
  const [vinculos, solicitudes] = await Promise.all([vinculosDe(id), solicitudesDeTitular(id)]);
  return {
    id: t.id, tipoPersona: t.tipo_persona, dni: t.dni, cuit: t.cuit, nombre: t.nombre, telefono: t.telefono, domicilio: t.domicilio,
    creadoEn: t.created_at.toISOString(), objetos: t.objetos, vinculos, solicitudes,
  };
}

/** Busca por DNI, CUIT, nombre o razón social, número de certificado, patente/etiqueta o número de registro. */
export async function buscarTitulares(q: string): Promise<{ criterio: string; filas: TitularResumen[] }> {
  const texto = q.trim().slice(0, 100);
  if (!texto) return { criterio: 'vacio', filas: [] };
  const digitos = soloDigitos(texto);
  const patron = `%${texto.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const esNumero = /^\d+$/.test(texto.replace(/[-.\s]/g, ''));
  const criterio = esNumero ? (digitos.length === 11 ? 'cuit' : 'dni') : /^CERT-/i.test(texto) ? 'numero' : /^[a-z]{2}\d{3}[a-z]{2}$|^[a-z]{3}\d{3}$/i.test(texto.replace(/\s/g, '')) ? 'patente' : 'nombre';
  const { rows } = await pool.query<{ id: string }>(
    `select distinct t.id from public.fito_titulares t
       left join public.fitosanitarios_domisanitarios r on r.titular_id = t.id
       left join public.fito_certificados c on c.titular_id = t.id
      where ($1 <> '' and (t.dni = $1 or t.cuit = $1 or r.nro_registro::text = $3))
         or lower(t.nombre) like $2
         or lower(r.objeto_etiqueta) like $2
         or lower(c.numero) like $2
      limit 50`,
    [digitos.length >= 7 ? digitos : '', patron, esNumero && digitos.length < 7 ? String(Number(digitos)) : ''],
  );
  const titulares = await titularesPorIds(rows.map((r) => r.id));
  const filas = titulares.map(
    (t): TitularResumen => {
      const vigentes = t.objetos.filter((o) => o.estado === 'vigente');
      return {
        id: t.id,
        tipoPersona: t.tipo_persona,
        dni: t.dni,
        cuit: t.cuit,
        nombre: t.nombre,
        objetos: t.objetos.length,
        vigentes: vigentes.length,
        proximoVencimiento: vigentes.map((o) => o.venceEn!).sort()[0] ?? null,
      };
    },
  );
  return { criterio, filas };
}

/** Los titulares de los que este mail es representante (vínculo activo). */
export async function titularesDeMail(canonico: string): Promise<string[]> {
  const { rows } = await pool.query<{ titular_id: string }>(
    'select distinct titular_id from public.fito_vinculos where email_canonico = $1 and baja_en is null',
    [canonico],
  );
  return rows.map((r) => r.titular_id);
}

export const esRepresentante = async (canonico: string, titularId: string) =>
  (await titularesDeMail(canonico)).includes(titularId);
