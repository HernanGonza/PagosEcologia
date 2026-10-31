/**
 * Tablero de la persona (apps/api/src/modules/fitosanitarios/docs/titulares-y-certificados.md, 4.3 y 6.1): con el mail verificado ve los
 * titulares de los que es representante, sus certificados, vencimientos e historial, y renueva.
 * La búsqueda por DNI/CUIT NO es pública: solo se ve lo vinculado a este mail.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { MisTitularesResponse } from '@botonera/shared';
import { pool } from '../../db.js';
import { emailCanonico, emailValido, normalizarEmail, verificarCodigo } from '../../core/verificacion.js';
import { ErrorSolicitud, PROPOSITO_PERSONA, abrirSesionPersona, cerrarSesion, personaPorSesion, type PersonaSesion } from './solicitudes.js';
import { clienteDe, leerCookie, ponerCookie } from './publico.js';
import { titularesDeMail, titularesPorIds, solicitudesDeTitular, vinculosDe } from './titulares.js';
import { crearRenovaciones } from './renovaciones.js';
import { pdfDeCertificado } from './certificados.js';

export const personaRouter = Router();

async function conPersona(req: Request, res: Response, next: NextFunction) {
  try {
    const cookie = leerCookie(req);
    const p = cookie ? await personaPorSesion(cookie) : null;
    if (!p) {
      res.status(401).json({ error: 'Tu sesión venció. Volvé a entrar con tu mail.', codigo: 'enlace_invalido' });
      return;
    }
    res.locals.persona = p;
    next();
  } catch (e) {
    next(e);
  }
}
/** "ana.perez@gmail.com" → "a***@gmail.com". */
const ocultarMail = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
const personaDe = (res: Response) => res.locals.persona as PersonaSesion;

/** Entrar con el mail y el código (se pide con POST /codigo, `para: 'persona'`). */
personaRouter.post('/entrar', async (req, res, next) => {
  try {
    const email = normalizarEmail(String(req.body?.email ?? ''));
    if (!emailValido(email) || !(await verificarCodigo(email, PROPOSITO_PERSONA, String(req.body?.codigo ?? '').trim()))) {
      throw new ErrorSolicitud(400, 'El código no es correcto o ya venció. Pedí uno nuevo.');
    }
    ponerCookie(res, await abrirSesionPersona(email, clienteDe(req)));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

personaRouter.post('/salir', async (req, res, next) => {
  try {
    const cookie = leerCookie(req);
    if (cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie)) await cerrarSesion(cookie);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

personaRouter.get('/mis-titulares', conPersona, async (_req, res, next) => {
  try {
    const p = personaDe(res);
    const ids = await titularesDeMail(p.emailCanonico);
    const titulares = await titularesPorIds(ids);
    const body: MisTitularesResponse = {
      email: p.email,
      titulares: await Promise.all(
        titulares.map(async (t) => ({
          id: t.id, tipoPersona: t.tipo_persona, dni: t.dni, cuit: t.cuit, nombre: t.nombre, telefono: t.telefono, domicilio: t.domicilio,
          creadoEn: t.created_at.toISOString(), objetos: t.objetos,
          // Solo las solicitudes de ESTE mail: las de otros representantes no se ven.
          misSolicitudes: await solicitudesDeTitular(t.id, p.emailCanonico),
          representantes: (await vinculosDe(t.id))
            .filter((v) => !v.bajaEn)
            .map((v) => ({ id: v.id, email: ocultarMail(v.email), soyYo: emailCanonico(v.email) === p.emailCanonico, bajaSolicitada: !!v.bajaSolicitadaEn })),
        })),
      ),
      solicitudesSinTitular: await solicitudesSinTitular(p.emailCanonico),
    };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

async function solicitudesSinTitular(canonico: string) {
  const { rows } = await pool.query<{ id: string; numero: string; tipo: string; tipo_solicitud: 'alta' | 'renovacion'; estado: string; enviada_en: Date | null }>(
    `select id, numero, tipo, tipo_solicitud, estado, enviada_en from pagos.fito_solicitudes
      where email_canonico = $1 and titular_id is null order by created_at desc limit 50`,
    [canonico],
  );
  return rows.map((r) => ({ id: r.id, numero: r.numero, tipo: r.tipo, tipoSolicitud: r.tipo_solicitud, estado: r.estado, enviadaEn: r.enviada_en?.toISOString() ?? null }));
}

/** Renovar uno o varios certificados: crea una solicitud de renovación (borrador) por cada uno. */
personaRouter.post('/renovar', conPersona, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.certificados) ? req.body.certificados.map(String) : [];
    res.status(201).json(await crearRenovaciones(personaDe(res), ids));
  } catch (e) {
    next(e);
  }
});

/** PDF del certificado (con el QR). Solo para representantes del titular. */
personaRouter.get('/certificados/:id/pdf', conPersona, async (req, res, next) => {
  try {
    const { rows } = await pool.query<{ titular_id: string }>('select titular_id from public.fito_certificados where id = $1', [
      /^[0-9a-f-]{36}$/i.test(String(req.params.id)) ? String(req.params.id) : '00000000-0000-0000-0000-000000000000',
    ]);
    const propios = rows[0] ? await titularesDeMail(personaDe(res).emailCanonico) : [];
    if (!rows[0] || !propios.includes(rows[0].titular_id)) throw new ErrorSolicitud(404, 'El certificado no existe.');
    const r = await pdfDeCertificado(String(req.params.id));
    if (!r) throw new ErrorSolicitud(404, 'El certificado no existe.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${r.numero}.pdf"`);
    res.send(r.pdf);
  } catch (e) {
    next(e);
  }
});

/** Darse de baja uno mismo del titular: libre, sin trámite. */
personaRouter.post('/titulares/:id/baja', conPersona, async (req, res, next) => {
  try {
    const p = personaDe(res);
    const motivo = String(req.body?.motivo ?? '').trim().slice(0, 500) || 'Baja pedida por la propia persona.';
    const titularId = /^[0-9a-f-]{36}$/i.test(String(req.params.id)) ? String(req.params.id) : '00000000-0000-0000-0000-000000000000';
    const activos = await pool.query<{ email_canonico: string }>('select email_canonico from public.fito_vinculos where titular_id = $1 and baja_en is null', [titularId]);
    if (activos.rows.length === 1 && activos.rows[0].email_canonico === p.emailCanonico) {
      throw new ErrorSolicitud(409, 'Sos el único representante de este titular: la baja la tiene que resolver un técnico. Escribinos.');
    }
    const { rows } = await pool.query(
      `update public.fito_vinculos set baja_en = now(), baja_por = $3, baja_motivo = $4
        where titular_id = $1 and email_canonico = $2 and baja_en is null returning id`,
      [titularId, p.emailCanonico, `${p.email} (él/ella mismo/a)`, motivo],
    );
    if (!rows[0]) throw new ErrorSolicitud(404, 'No estás vinculado a ese titular.');
    // Se cierran las sesiones de ese mail: vuelve a entrar y ya no ve el titular.
    await pool.query('delete from pagos.fito_sesiones where email_canonico = $1 and solicitud_id is null', [p.emailCanonico]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Pedir la baja de OTRO representante: la resuelve un técnico. */
personaRouter.post('/vinculos/:id/pedir-baja', conPersona, async (req, res, next) => {
  try {
    const p = personaDe(res);
    const id = Number(req.params.id) || 0;
    const { rows } = await pool.query<{ titular_id: string }>('select titular_id from public.fito_vinculos where id = $1 and baja_en is null', [id]);
    if (!rows[0] || !(await titularesDeMail(p.emailCanonico)).includes(rows[0].titular_id)) throw new ErrorSolicitud(404, 'El vínculo no existe.');
    await pool.query(
      'update public.fito_vinculos set baja_solicitada_en = now(), baja_solicitada_por = $2 where id = $1 and baja_solicitada_en is null',
      [id, p.email],
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
