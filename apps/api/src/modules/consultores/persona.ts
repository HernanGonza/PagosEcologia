/**
 * Tablero de la persona (apps/api/src/modules/consultores/docs/titulares-y-certificados.md, 4.3 y 6.1): con el mail verificado ve los
 * titulares de los que es representante, sus certificados, vencimientos e historial, y renueva.
 * La búsqueda por DNI/CUIT NO es pública: solo se ve lo vinculado a este mail.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { emailCanonico, emailValido, normalizarEmail, verificarCodigo } from '../../core/verificacion.js';
import {
  ErrorSolicitud, MODULO, PROPOSITO_PERSONA, abrirSesionPersona, bloquear, cerrarSesion, configModulo, enTransaccion, personaPorSesion,
  segundosDeSesion, solicitudDeLaPersona, tipoPublico, type PersonaSesion,
} from './solicitudes.js';
import { ErrorPago, iniciarPago } from '../../core/pagos-online.js';
import { clienteDe, ipDe, leerCookie, ponerCookie } from './publico.js';
import { titularesDeMail, titularesPorIds, solicitudesDeTitular, vinculosDe } from './titulares.js';
import { crearRenovaciones } from './renovaciones.js';
import { pdfDeCertificado } from './certificados.js';
import type { consultores as c } from '@botonera/shared';
type MisTitularesResponse = c.MisTitularesResponse;

export const personaRouter = Router();

async function conPersona(req: Request, res: Response, next: NextFunction) {
  try {
    const cookie = leerCookie(req);
    const p = cookie ? await personaPorSesion(cookie) : null;
    if (!p) {
      res.status(401).json({ error: 'Tu sesión venció. Volvé a entrar con tu mail.', codigo: 'enlace_invalido' });
      return;
    }
    // Cuánto le queda a la sesión: el front lo usa para avisar antes de que se cierre.
    const segundos = await segundosDeSesion(cookie);
    if (segundos !== null) res.setHeader('X-Sesion-Segundos', String(segundos));
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
          misSolicitudes: await conImporte(await solicitudesDeTitular(t.id, p.emailCanonico)),
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
    `select id, numero, tipo, tipo_solicitud, estado, enviada_en from pagos.cons_solicitudes
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

/** Importe de la tasa de las solicitudes aprobadas (las únicas que se pueden pagar); el resto, null. */
async function conImporte<T extends { estado: string; tipo: string }>(filas: T[]): Promise<(T & { importeCentavos: number | null })[]> {
  if (!filas.some((f) => f.estado === 'aprobada')) return filas.map((f) => ({ ...f, importeCentavos: null }));
  const config = await configModulo();
  return Promise.all(
    filas.map(async (f) => {
      if (f.estado !== 'aprobada') return { ...f, importeCentavos: null };
      try {
        return { ...f, importeCentavos: (await tipoPublico(config, f.tipo)).importeCentavos ?? null };
      } catch {
        return { ...f, importeCentavos: null };
      }
    }),
  );
}

/**
 * Pagar una o varias solicitudes APROBADAS de la persona con una sola orden: el total es la suma de las tasas, calculada
 * acá (el navegador solo manda los números). Las que siguen en revisión no entran: se pagan después, en otra orden.
 */
personaRouter.post('/pagar', conPersona, async (req, res, next) => {
  try {
    const p = personaDe(res);
    const numeros = [...new Set((Array.isArray(req.body?.numeros) ? req.body.numeros : []).map(String))] as string[];
    if (!numeros.length || numeros.length > 50) throw new ErrorSolicitud(400, 'Elegí entre 1 y 50 solicitudes para pagar.');
    const iniciado = await enTransaccion(async (client) => {
      // Solo se resuelven dentro de las solicitudes de este mail; se bloquean por id para no cruzar bloqueos con otro pago.
      const propias = [];
      for (const n of numeros) {
        const s = await solicitudDeLaPersona(p.emailCanonico, n);
        if (!s) throw new ErrorSolicitud(404, `La solicitud ${n} no existe.`);
        propias.push(s);
      }
      propias.sort((a, b) => (a.id < b.id ? -1 : 1));
      const config = await configModulo();
      const lineas: { id: string; numero: string; tipo: string; importeCentavos: number }[] = [];
      for (const s of propias) {
        const fila = await bloquear(client, s.id);
        if (fila.estado !== 'aprobada') throw new ErrorSolicitud(409, `La solicitud ${fila.numero} no está aprobada, así que todavía no se puede pagar.`);
        const importe = (await tipoPublico(config, fila.tipo)).importeCentavos;
        if (!importe || importe <= 0) throw new ErrorSolicitud(409, `La solicitud ${fila.numero} no tiene una tarifa cargada: escribinos.`);
        lineas.push({ id: fila.id, numero: fila.numero, tipo: fila.tipo, importeCentavos: importe });
      }
      const total = lineas.reduce((a, l) => a + l.importeCentavos, 0);
      const unica = lineas.length === 1;
      try {
        return await iniciarPago(client, {
          moduloSlug: MODULO,
          refId: unica ? lineas[0].id : null,
          identificador: unica ? lineas[0].numero : `Lote de ${lineas.length}: ${lineas.map((l) => l.numero).join(', ')}`.slice(0, 300),
          importeCentavos: total,
          descripcion: unica ? `Tasa - solicitud ${lineas[0].numero}` : `Tasas - ${lineas.length} solicitudes`,
          ip: ipDe(req),
          datos: { solicitudes: lineas.map((l) => l.id) },
          tarifas: lineas,
        });
      } catch (e) {
        if (e instanceof ErrorPago) throw new ErrorSolicitud(e.status, e.message);
        throw e;
      }
    });
    res.json(iniciado);
  } catch (e) {
    next(e);
  }
});

/** PDF del certificado (con el QR). Solo para representantes del titular. */
personaRouter.get('/certificados/:id/pdf', conPersona, async (req, res, next) => {
  try {
    const { rows } = await pool.query<{ titular_id: string }>('select titular_id from public.cons_certificados where id = $1', [
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
    const activos = await pool.query<{ email_canonico: string }>('select email_canonico from public.cons_vinculos where titular_id = $1 and baja_en is null', [titularId]);
    if (activos.rows.length === 1 && activos.rows[0].email_canonico === p.emailCanonico) {
      throw new ErrorSolicitud(409, 'Sos el único representante de este titular: la baja la tiene que resolver un técnico. Escribinos.');
    }
    const { rows } = await pool.query(
      `update public.cons_vinculos set baja_en = now(), baja_por = $3, baja_motivo = $4
        where titular_id = $1 and email_canonico = $2 and baja_en is null returning id`,
      [titularId, p.emailCanonico, `${p.email} (él/ella mismo/a)`, motivo],
    );
    if (!rows[0]) throw new ErrorSolicitud(404, 'No estás vinculado a ese titular.');
    // Se cierran las sesiones de ese mail: vuelve a entrar y ya no ve el titular.
    await pool.query('delete from pagos.cons_sesiones where email_canonico = $1 and solicitud_id is null', [p.emailCanonico]);
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
    const { rows } = await pool.query<{ titular_id: string }>('select titular_id from public.cons_vinculos where id = $1 and baja_en is null', [id]);
    if (!rows[0] || !(await titularesDeMail(p.emailCanonico)).includes(rows[0].titular_id)) throw new ErrorSolicitud(404, 'El vínculo no existe.');
    await pool.query(
      'update public.cons_vinculos set baja_solicitada_en = now(), baja_solicitada_por = $2 where id = $1 and baja_solicitada_en is null',
      [id, p.email],
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
