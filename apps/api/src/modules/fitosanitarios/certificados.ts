/**
 * Emisión de certificados, verificación pública (QR) y PDF.
 *
 * Emitir = en UNA transacción: se inserta el certificado en el historial (`public.fito_certificados`),
 * el trigger actualiza el vencimiento del registro del objeto y la solicitud pasa a `emitida`.
 * Hoy el pago no está implementado: `emitirCertificado` espera una solicitud `pagada` y la llamará el
 * flujo de pago cuando exista (o la ruta de desarrollo `EMISION_SIMULADA`, ver index.ts).
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { PoolClient } from 'pg';
import { type EstadoCertificado, type VerificacionPublica } from '@botonera/shared';
import { pool } from '../../db.js';
import { ErrorSolicitud, cambiarEstado, configModulo, type Actor, type FilaSolicitud } from './solicitudes.js';

/** Qué dato del trámite es la "etiqueta" del objeto (la patente, la dirección…). */
const CLAVE_ETIQUETA: Record<string, string> = {
  vehiculo: 'dominio',
  comercio: 'direccion-local',
  deposito: 'direccion-deposito',
  fraccionamiento: 'direccion-planta',
};

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** El `tipo_id` del catálogo de Ecodatos (`tipos_fito_domi`) que corresponde al tipo del trámite. */
async function tipoDeEcodatos(client: PoolClient, slug: string): Promise<string> {
  const { rows } = await client.query<{ id: string; nombre: string }>('select id, nombre from public.tipos_fito_domi');
  const t = rows.find((r) => sinAcentos(r.nombre).startsWith(slug));
  if (!t) throw new ErrorSolicitud(409, `En Ecodatos falta el tipo "${slug}" en el catálogo de tipos de fitosanitarios.`);
  return t.id;
}

const normalizarEtiqueta = (slug: string, v: string | undefined) =>
  (slug === 'vehiculo' ? (v ?? '').replace(/[\s-]/g, '').toUpperCase() : (v ?? '').trim()) || null;

export interface CertificadoEmitido {
  id: string;
  numero: string;
  vigenteDesde: string;
  venceEn: string;
  registroId: string;
  codigoVerificacion: string;
}

/**
 * Emite el certificado de una solicitud pagada. Se llama dentro de una transacción con la fila bloqueada.
 *   - Alta: crea el objeto en el registro; vale desde hoy (Argentina) por 12 meses.
 *   - Renovación anticipada: vale desde el día siguiente al vencimiento del anterior.
 *   - Renovación tardía (ya venció): vale desde hoy, sin cobertura retroactiva.
 */
export async function emitirCertificado(client: PoolClient, s: FilaSolicitud, actor: Actor): Promise<CertificadoEmitido> {
  if (s.estado !== 'pagada') throw new ErrorSolicitud(409, 'Solo se emite el certificado de una solicitud pagada.');
  if (!s.titular_id) throw new ErrorSolicitud(409, 'La solicitud no tiene titular: tiene que aprobarla un técnico antes.');
  const config = (await configModulo()) as unknown as { renovacion?: { validezMeses?: number }; solicitud: { tipos: { slug: string; requisitos: { clave: string; tipo: string }[] }[] } };
  const meses = config.renovacion?.validezMeses ?? 12;
  const tipoConfig = config.solicitud.tipos.find((t) => t.slug === s.tipo);
  if (!tipoConfig) throw new ErrorSolicitud(409, 'El tipo de la solicitud ya no existe en la configuración.');

  const { rows: hoyRows } = await client.query<{ hoy: string }>('select public.fito_hoy()::text as hoy');
  const hoy = hoyRows[0].hoy;

  // Vencimiento de la VTV (solo vehículos): el que cargó la persona en el documento vigente.
  const { rows: vtv } = await client.query<{ vence_en: string | null }>(
    "select vence_en::text from pagos.fito_documentos where solicitud_id = $1 and requisito = 'vtv' and reemplazado_en is null order by created_at desc limit 1",
    [s.id],
  );
  const vtvVenceEn = vtv[0]?.vence_en ?? null;
  const datosDelObjeto = Object.fromEntries(
    tipoConfig.requisitos.filter((r) => r.tipo !== 'documento').map((r) => [r.clave, s.datos[r.clave]]).filter(([, v]) => v),
  );

  let registroId: string;
  let vigenteDesde: string;
  let renovadoDe: string | null = null;

  if (s.tipo_solicitud === 'renovacion') {
    const { rows } = await client.query<{ id: string; registro_id: string; vence_en: string; revocado_en: Date | null; usado: boolean }>(
      `select c.id, c.registro_id, c.vence_en::text, c.revocado_en,
              exists (select 1 from public.fito_certificados x where x.renovado_de = c.id) as usado
         from public.fito_certificados c where c.id = $1 for update`,
      [s.renueva_certificado_id],
    );
    const previo = rows[0];
    if (!previo) throw new ErrorSolicitud(409, 'El certificado que se renueva no existe.');
    if (previo.revocado_en) throw new ErrorSolicitud(409, 'El certificado que se renueva fue revocado.');
    if (previo.usado) throw new ErrorSolicitud(409, 'Ese certificado ya fue renovado.');
    registroId = previo.registro_id;
    renovadoDe = previo.id;
    const { rows: v } = await client.query<{ desde: string }>(
      'select (case when $1::date >= $2::date then $1::date + 1 else $2::date end)::text as desde',
      [previo.vence_en, hoy],
    );
    vigenteDesde = v[0].desde;
    await client.query(
      `update public.fitosanitarios_domisanitarios
          set datos = datos || $2::jsonb, vtv_vence_en = coalesce($3::date, vtv_vence_en),
              objeto_etiqueta = coalesce($4, objeto_etiqueta)
        where id = $1`,
      [registroId, JSON.stringify(datosDelObjeto), vtvVenceEn, normalizarEtiqueta(s.tipo, s.datos[CLAVE_ETIQUETA[s.tipo] ?? ''])],
    );
  } else {
    const tipoId = await tipoDeEcodatos(client, s.tipo);
    const etiqueta = normalizarEtiqueta(s.tipo, s.datos[CLAVE_ETIQUETA[s.tipo] ?? '']);
    // Si el mismo titular ya tenía este objeto registrado (ej. pasó la ventana de renovación y empezó de nuevo),
    // se reutiliza: el historial del objeto sigue siendo uno solo.
    const previo = etiqueta
      ? await client.query<{ id: string }>(
          `select id from public.fitosanitarios_domisanitarios
            where titular_id = $1 and tipo_id = $2 and lower(objeto_etiqueta) = lower($3) and revocado_en is null for update`,
          [s.titular_id, tipoId, etiqueta],
        )
      : { rows: [] as { id: string }[] };
    if (previo.rows[0]) {
      registroId = previo.rows[0].id;
      await client.query(
        'update public.fitosanitarios_domisanitarios set datos = datos || $2::jsonb, vtv_vence_en = coalesce($3::date, vtv_vence_en) where id = $1',
        [registroId, JSON.stringify(datosDelObjeto), vtvVenceEn],
      );
    } else {
      const { rows } = await client.query<{ id: string }>(
        `insert into public.fitosanitarios_domisanitarios (titular_id, tipo_id, objeto_etiqueta, datos, vtv_vence_en)
         values ($1, $2, $3, $4, $5) returning id`,
        [s.titular_id, tipoId, etiqueta, JSON.stringify(datosDelObjeto), vtvVenceEn],
      );
      registroId = rows[0].id;
    }
    vigenteDesde = hoy;
  }

  const { rows: reg } = await client.query<{ tipo_id: string | null }>('select tipo_id from public.fitosanitarios_domisanitarios where id = $1', [registroId]);
  const { rows } = await client.query<{ id: string; numero: string; vigente_desde: string; vence_en: string; codigo_verificacion: string }>(
    `insert into public.fito_certificados (registro_id, titular_id, tipo_id, solicitud_id, orden_id, vigente_desde, vence_en, renovado_de)
     values ($1, $2, $3, $4, null, $5::date, ($5::date + make_interval(months => $6::int))::date, $7)
     returning id, numero, vigente_desde::text, vence_en::text, codigo_verificacion`,
    [registroId, s.titular_id, reg[0]?.tipo_id ?? null, s.id, vigenteDesde, meses, renovadoDe],
  );
  const c = rows[0];
  await cambiarEstado(client, s, 'emitida', { ...actor, nota: `Certificado ${c.numero} emitido.` }, { registro_id: registroId, certificado_id: c.id });
  return { id: c.id, numero: c.numero, vigenteDesde: c.vigente_desde, venceEn: c.vence_en, registroId, codigoVerificacion: c.codigo_verificacion };
}

// --- Verificación pública (QR) ---------------------------------------------------------------------

/** Datos mínimos de un certificado por su código del QR. Null si no existe (la respuesta es siempre la misma). */
export async function verificarPorCodigo(codigo: string): Promise<VerificacionPublica | null> {
  if (!/^[0-9a-f]{64}$/.test(codigo)) return null;
  const { rows } = await pool.query<{
    numero: string; estado: EstadoCertificado; tipo_nombre: string | null; objeto_etiqueta: string | null; vigente_desde: string;
    vence_en: string; titular: string; vtv_vence_en: string | null;
  }>(
    `select c.numero, c.estado, t.nombre as tipo_nombre, r.objeto_etiqueta, c.vigente_desde::text, c.vence_en::text, ti.nombre as titular,
            r.vtv_vence_en::text
       from public.fito_certificados_estado c
       join public.fitosanitarios_domisanitarios r on r.id = c.registro_id
       join public.fito_titulares ti on ti.id = c.titular_id
       left join public.tipos_fito_domi t on t.id = c.tipo_id
      where c.codigo_verificacion = $1`,
    [codigo],
  );
  const f = rows[0];
  if (!f) return null;
  return {
    numero: f.numero,
    estado: f.estado,
    tipoNombre: f.tipo_nombre,
    etiqueta: f.objeto_etiqueta,
    vigenteDesde: f.vigente_desde,
    venceEn: f.vence_en,
    titular: f.titular,
    vtvVenceEn: f.vtv_vence_en,
  };
}

export const urlVerificacion = (codigo: string) => `${(process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, '')}/verificar/${codigo}`;

// --- PDF con QR --------------------------------------------------------------------------------------

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

/** El PDF se arma al pedirlo, a partir de los datos del historial: no se guarda ni se puede desactualizar. */
export async function pdfDeCertificado(certificadoId: string): Promise<{ numero: string; pdf: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(certificadoId)) return null;
  const { rows } = await pool.query<{ codigo_verificacion: string }>('select codigo_verificacion from public.fito_certificados where id = $1', [certificadoId]);
  if (!rows[0]) return null;
  const v = await verificarPorCodigo(rows[0].codigo_verificacion);
  if (!v) return null;
  const qr = await QRCode.toBuffer(urlVerificacion(rows[0].codigo_verificacion), { margin: 1, width: 220, errorCorrectionLevel: 'M' });

  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `Certificado ${v.numero}`, Author: 'Ministerio de Ecología de Misiones' } });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const fin = new Promise<void>((ok) => doc.on('end', () => ok()));

  doc.fillColor('#2f5540').fontSize(11).text('MINISTERIO DE ECOLOGÍA Y RECURSOS NATURALES RENOVABLES · MISIONES', { align: 'center' });
  doc.moveDown(1.5).fontSize(22).text('Certificado de fitosanitarios y domisanitarios', { align: 'center' });
  doc.moveDown(0.5).fontSize(13).fillColor('#21130d').text(`N.º ${v.numero}`, { align: 'center' });
  doc.moveDown(2);
  const fila = (k: string, val: string | null) => {
    if (!val) return;
    doc.fontSize(10).fillColor('#6b6152').text(k.toUpperCase());
    doc.fontSize(14).fillColor('#21130d').text(val).moveDown(0.8);
  };
  fila('Titular', v.titular);
  fila('Tipo', v.tipoNombre);
  fila(v.tipoNombre?.toLowerCase().startsWith('veh') ? 'Patente' : 'Objeto', v.etiqueta);
  fila('Vigente desde', fechaLarga(v.vigenteDesde));
  fila('Vence el', fechaLarga(v.venceEn));
  fila('VTV vence el', v.vtvVenceEn ? fechaLarga(v.vtvVenceEn) : null);
  if (v.estado === 'revocado') doc.fontSize(14).fillColor('#a23b3b').text('CERTIFICADO REVOCADO', { align: 'center' });

  doc.image(qr, doc.page.width / 2 - 70, doc.y + 20, { width: 140 });
  doc.y += 180;
  doc.fontSize(9).fillColor('#6b6152').text('Escaneá el código para verificar que este certificado es auténtico y ver su estado actual.', { align: 'center' });
  doc.end();
  await fin;
  return { numero: v.numero, pdf: Buffer.concat(partes) };
}
