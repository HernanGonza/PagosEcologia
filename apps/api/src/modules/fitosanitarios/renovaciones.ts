/**
 * Renovación de certificados (apps/api/src/modules/fitosanitarios/docs/titulares-y-certificados.md, 4.4).
 *
 * Una solicitud de renovación por certificado, precargada con los datos del titular y del objeto y
 * con los documentos del certificado anterior. Se pueden renovar varios a la vez. Si no cambia nada
 * y los documentos siguen vigentes, al enviarla se aprueba sola; si no, la revisa un técnico.
 */
import type { PoolClient } from 'pg';
import { REPRESENTA_TITULAR, type RenovacionResponse } from '@botonera/shared';
import { pool } from '../../db.js';
import { ErrorSolicitud, cambiarEstado, configModulo, enTransaccion, type FilaSolicitud } from './solicitudes.js';
import { titularesPorIds, titularesDeMail } from './titulares.js';
import { CLAVE_ETIQUETA, sinAcentos } from './certificados.js';


interface Fuente {
  tipo: string;
  titularId: string;
  registroId: string;
  certificadoId: string;
  certificadoSolicitudId: string | null;
  vinculoSolicitudId: string | null;
  datos: Record<string, string>;
}

/** Reúne lo que se precarga en una renovación: titular, objeto y cómo presentó la persona la primera vez. */
async function fuente(db: Pick<PoolClient, 'query'>, certificadoId: string, canonico: string): Promise<Fuente> {
  const { rows } = await db.query<{
    titular_id: string; registro_id: string; solicitud_id: string | null; tipo_nombre: string | null; objeto_etiqueta: string | null;
    reg_datos: Record<string, string>; dni: string | null; cuit: string | null; nombre: string; telefono: string | null; domicilio: string | null;
    vinculo_solicitud_id: string | null;
  }>(
    `select c.titular_id, c.registro_id, c.solicitud_id, t.nombre as tipo_nombre, r.objeto_etiqueta, r.datos as reg_datos,
            ti.dni, ti.cuit, ti.nombre, ti.telefono, ti.domicilio,
            (select v.solicitud_id from public.fito_vinculos v where v.titular_id = c.titular_id and v.email_canonico = $2 and v.baja_en is null limit 1) as vinculo_solicitud_id
       from public.fito_certificados c
       join public.fitosanitarios_domisanitarios r on r.id = c.registro_id
       join public.fito_titulares ti on ti.id = c.titular_id
       left join public.tipos_fito_domi t on t.id = c.tipo_id
      where c.id = $1`,
    [certificadoId, canonico],
  );
  const f = rows[0];
  if (!f) throw new ErrorSolicitud(404, 'El certificado no existe.');
  const config = (await configModulo()) as unknown as { solicitud: { tipos: { slug: string }[] } };
  const tipo = config.solicitud.tipos.find((t) => sinAcentos(f.tipo_nombre ?? '').startsWith(t.slug))?.slug;
  if (!tipo) throw new ErrorSolicitud(409, 'No se puede renovar: el tipo del certificado ya no está en la configuración.');

  let representa = REPRESENTA_TITULAR;
  if (f.vinculo_solicitud_id) {
    const r = await db.query<{ datos: Record<string, string> }>('select datos from pagos.fito_solicitudes where id = $1', [f.vinculo_solicitud_id]);
    representa = r.rows[0]?.datos?.representa || representa;
  }
  const etiquetaClave = CLAVE_ETIQUETA[tipo];
  const datos: Record<string, string> = {
    ...Object.fromEntries(Object.entries(f.reg_datos ?? {}).filter(([, v]) => typeof v === 'string')),
    identificador: f.cuit ?? f.dni ?? '',
    titular: f.nombre,
    telefono: f.telefono ?? '',
    domicilio: f.domicilio ?? '',
    representa,
  };
  if (etiquetaClave && f.objeto_etiqueta && !datos[etiquetaClave]) datos[etiquetaClave] = f.objeto_etiqueta;
  for (const k of Object.keys(datos)) if (!datos[k]) delete datos[k];
  return {
    tipo, titularId: f.titular_id, registroId: f.registro_id, certificadoId, certificadoSolicitudId: f.solicitud_id,
    vinculoSolicitudId: f.vinculo_solicitud_id, datos,
  };
}

/** Crea una solicitud de renovación (borrador) por cada certificado. Todo o nada. */
export async function crearRenovaciones(persona: { email: string; emailCanonico: string }, certificadoIds: string[]): Promise<RenovacionResponse> {
  const ids = [...new Set(certificadoIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) throw new ErrorSolicitud(400, 'Elegí al menos un certificado para renovar.');
  if (ids.length > 50) throw new ErrorSolicitud(400, 'Se pueden renovar hasta 50 certificados a la vez.');

  const { rows: titularesCert } = await pool.query<{ id: string; titular_id: string }>(
    'select id, titular_id from public.fito_certificados where id = any($1::uuid[])', [ids],
  );
  if (titularesCert.length !== ids.length) throw new ErrorSolicitud(404, 'Algún certificado no existe.');
  const propios = new Set(await titularesDeMail(persona.emailCanonico));
  if (titularesCert.some((c) => !propios.has(c.titular_id))) throw new ErrorSolicitud(403, 'No sos representante de alguno de esos certificados.');

  // Cada uno tiene que ser el certificado ACTUAL de su objeto y estar dentro de la ventana de renovación.
  const titulares = await titularesPorIds([...new Set(titularesCert.map((c) => c.titular_id))]);
  const objetos = titulares.flatMap((t) => t.objetos);
  for (const id of ids) {
    const o = objetos.find((x) => x.certificadoActualId === id);
    if (!o) throw new ErrorSolicitud(409, 'Solo se puede renovar el certificado más reciente de cada objeto.');
    if (!o.puedeRenovar) throw new ErrorSolicitud(409, `${o.etiqueta ?? o.tipoNombre ?? 'Un certificado'}: ${o.motivoNoRenovar}`);
  }

  try {
    return await enTransaccion(async (client) => {
      const creadas: RenovacionResponse['solicitudes'] = [];
      for (const id of ids) {
        const f = await fuente(client, id, persona.emailCanonico);
        const { rows } = await client.query<{ id: string; numero: string }>(
          `insert into pagos.fito_solicitudes (tipo, email, email_canonico, datos, tipo_solicitud, titular_id, registro_id, renueva_certificado_id)
           values ($1, $2, $3, $4, 'renovacion', $5, $6, $7) returning id, numero`,
          [f.tipo, persona.email, persona.emailCanonico, f.datos, f.titularId, f.registroId, id],
        );
        const s = rows[0];
        await cambiarEstado(client, { id: s.id, estado: 'borrador' }, 'borrador', { actor: 'solicitante', nota: 'Renovación iniciada.' });
        // Los documentos del certificado anterior se arrastran (comparten el archivo); el poder, el que presentó esta persona.
        for (const [origen, excluirPoder] of [[f.certificadoSolicitudId, true], [f.vinculoSolicitudId, false]] as const) {
          if (!origen) continue;
          await client.query(
            `insert into pagos.fito_documentos (solicitud_id, requisito, ruta, nombre, tipo_mime, bytes, sha256, vence_en, origen_documento_id)
             select $1, d.requisito, d.ruta, d.nombre, d.tipo_mime, d.bytes, d.sha256, d.vence_en, coalesce(d.origen_documento_id, d.id)
               from pagos.fito_documentos d
              where d.solicitud_id = $2 and d.reemplazado_en is null
                and (d.requisito ${excluirPoder ? '<>' : '='} 'poder')
                and not exists (select 1 from pagos.fito_documentos x where x.solicitud_id = $1 and x.requisito = d.requisito and x.reemplazado_en is null)`,
            [s.id, origen],
          );
        }
        creadas.push({ numero: s.numero, certificadoId: id, estado: 'borrador', requiereRevision: false });
      }
      return { solicitudes: creadas };
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new ErrorSolicitud(409, 'Alguno de esos certificados ya tiene una renovación en curso.');
    throw e;
  }
}

/**
 * ¿Se puede aprobar sola? Sí si no cambió ningún dato respecto de lo registrado, no se subió ningún
 * documento nuevo y ningún documento con vencimiento está vencido.
 */
export async function renovacionSinCambios(s: FilaSolicitud): Promise<boolean> {
  if (!s.renueva_certificado_id) return false;
  const f = await fuente(pool, s.renueva_certificado_id, s.email_canonico ?? '');
  const claves = new Set([...Object.keys(f.datos), ...Object.keys(s.datos)]);
  for (const k of claves) if ((f.datos[k] ?? '').trim() !== (s.datos[k] ?? '').trim()) return false;
  const { rows } = await pool.query<{ nuevo: boolean; vencido: boolean }>(
    `select coalesce(bool_or(origen_documento_id is null), false) as nuevo,
            coalesce(bool_or(vence_en is not null and vence_en < public.fito_hoy()), false) as vencido
       from pagos.fito_documentos where solicitud_id = $1 and reemplazado_en is null`,
    [s.id],
  );
  return !rows[0].nuevo && !rows[0].vencido;
}
