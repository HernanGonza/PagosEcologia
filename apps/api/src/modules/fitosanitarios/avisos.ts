/**
 * Tareas diarias (las corre `tareas.ts` desde el cron del servidor):
 *   1) Avisos de vencimiento de certificados, una vez por umbral (30 días, 7 días y al vencer).
 *   2) Aprobaciones sin pago vencidas pasan a `vencida` (la lectura ya las muestra así; esto deja el historial).
 *   3) Limpieza de sesiones y enlaces viejos.
 * Los avisos van al mail de la solicitud que originó el último certificado, un mail por casilla
 * con todos los certificados que cruzaron un umbral (una flota de 20 vehículos no manda 20 mails).
 */
import { pool } from '../../db.js';
import { avisar, cambiarEstado, enTransaccion, SQL_HOY } from './solicitudes.js';
import { configRenovacion } from './titulares.js';

const WEB = () => (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, '');

/** El umbral que corresponde a `dias` para vencer: el aviso más cercano que todavía no pasó (0 = vence hoy o ya venció). */
export function umbralDeAviso(dias: number, avisosDias: number[]): number {
  if (dias <= 0) return 0;
  const orden = [...avisosDias].filter((d) => d > 0).sort((a, b) => a - b);
  return orden.find((a) => a >= dias) ?? -1;
}

function asuntoAviso(lista: { numero: string; vencido: boolean }[]): string {
  const todos = lista.every((p) => p.vencido);
  const ninguno = lista.every((p) => !p.vencido);
  if (lista.length === 1) return `Tu certificado ${lista[0].numero} ${todos ? 'venció' : 'está por vencer'}`;
  return todos ? `${lista.length} certificados vencieron` : ninguno ? `${lista.length} certificados están por vencer` : `${lista.length} certificados vencen o ya vencieron`;
}

export async function procesarAvisosVencimiento(): Promise<{ nuevos: number; mails: number; fallidos: number }> {
  const cfg = await configRenovacion();
  const maximo = Math.max(...cfg.avisosDias, 0);
  const { rows: candidatos } = await pool.query<{ id: string; dias: number; email: string | null }>(
    // Destinatario: el mail de la solicitud si sigue siendo representante; si lo dieron de baja,
    // los representantes que quedan (el aviso no le llega a quien ya no representa al titular).
    `select c.id, c.dias_para_vencer as dias, e.email
       from public.fito_certificados_estado c
       join pagos.fito_solicitudes so on so.id = c.solicitud_id
       cross join lateral (
         select v.email from public.fito_vinculos v
          where v.titular_id = c.titular_id and v.baja_en is null
            and (v.email_canonico = so.email_canonico
                 or not exists (select 1 from public.fito_vinculos w
                                 where w.titular_id = c.titular_id and w.baja_en is null and w.email_canonico = so.email_canonico))
       ) e
      where c.revocado_en is null
        and not exists (select 1 from public.fito_certificados x where x.renovado_de = c.id)
        and c.dias_para_vencer <= $1 and c.dias_para_vencer >= -$2::int`,
    [maximo, cfg.graciaDias],
  );
  let nuevos = 0;
  for (const c of candidatos) {
    const umbral = umbralDeAviso(c.dias, cfg.avisosDias);
    if (umbral < 0 || !c.email) continue;
    const r = await pool.query(
      'insert into pagos.fito_avisos_vencimiento (certificado_id, dias_antes, email) values ($1, $2, $3) on conflict (certificado_id, dias_antes, email) do nothing',
      [c.id, umbral, c.email],
    );
    nuevos += r.rowCount ?? 0;
  }

  // Todo lo que está sin enviar (incluye reintentos de mails que fallaron).
  const { rows: pendientes } = await pool.query<{
    id: string; email: string; dias_antes: number; numero: string; vence_en: string; vencido: boolean; etiqueta: string | null; tipo: string | null;
  }>(
    `select a.id::text, a.email, a.dias_antes, c.numero, c.vence_en::text, c.vence_en < public.fito_hoy() as vencido, r.objeto_etiqueta as etiqueta, t.nombre as tipo
       from pagos.fito_avisos_vencimiento a
       join public.fito_certificados c on c.id = a.certificado_id
       join public.fitosanitarios_domisanitarios r on r.id = c.registro_id
       left join public.tipos_fito_domi t on t.id = c.tipo_id
      where a.enviado_en is null and not exists (select 1 from public.fito_certificados x where x.renovado_de = c.id)
      order by a.email, c.vence_en`,
  );
  const porMail = new Map<string, typeof pendientes>();
  for (const p of pendientes) porMail.set(p.email, [...(porMail.get(p.email) ?? []), p]);

  let mails = 0;
  let fallidos = 0;
  for (const [email, lista] of porMail) {
    const linea = (p: (typeof lista)[number]) =>
      `• ${[p.tipo, p.etiqueta].filter(Boolean).join(' ')} (${p.numero}): ${p.vencido ? 'venció' : p.dias_antes === 0 ? 'vence hoy' : `vence en ${p.dias_antes} días o menos`}, el ${p.vence_en.split('-').reverse().join('/')}.`;
    const ok = await avisar({
      para: email,
      asunto: asuntoAviso(lista),
      titulo: lista.every((p) => p.vencido) ? 'Certificados vencidos' : 'Certificados por vencer',
      parrafos: [
        'Estos certificados de fitosanitarios y domisanitarios están por vencer o ya vencieron:',
        ...lista.map(linea),
        `Se pueden renovar desde ${cfg.anticipacionDias} días antes del vencimiento y hasta ${cfg.graciaDias} días después. Pasado ese plazo hay que iniciar una solicitud nueva.`,
        'Entrá con tu mail a "Mis certificados" para renovarlos; podés renovar varios juntos.',
      ],
      boton: { texto: 'Ver mis certificados', url: `${WEB()}/pagar/fitosanitarios/mis-certificados` },
    });
    await pool.query(
      ok ? 'update pagos.fito_avisos_vencimiento set enviado_en = now(), error = null where id = any($1::bigint[])' : "update pagos.fito_avisos_vencimiento set error = 'no se pudo enviar el mail' where id = any($1::bigint[])",
      [lista.map((p) => Number(p.id))],
    );
    if (ok) mails += 1;
    else fallidos += 1;
  }
  return { nuevos, mails, fallidos };
}

export async function vencerAprobaciones(): Promise<number> {
  const { rows } = await pool.query<{ id: string; estado: 'aprobada' }>(
    `select id, estado from pagos.fito_solicitudes where estado = 'aprobada' and aprobacion_vence < ${SQL_HOY}`,
  );
  for (const s of rows) {
    await enTransaccion(async (client) => {
      await client.query('select 1 from pagos.fito_solicitudes where id = $1 for update', [s.id]);
      await cambiarEstado(client, s, 'vencida', { actor: 'sistema', nota: 'La aprobación venció sin que se hiciera el pago.' });
    });
  }
  return rows.length;
}

export async function procesarTareasDiarias() {
  const avisos = await procesarAvisosVencimiento();
  const aprobacionesVencidas = await vencerAprobaciones();
  await pool.query("delete from pagos.fito_sesiones where ultimo_uso < now() - interval '2 days'");
  await pool.query("delete from pagos.fito_enlaces where expira_en < now() - interval '7 days'");
  return { ...avisos, aprobacionesVencidas };
}
