/**
 * Parte pública de las solicitudes: sin cuenta. La persona verifica su mail con un código,
 * crea la solicitud y desde ahí entra siempre con su enlace privado (`:token`).
 */
import { createHash, randomUUID } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { errorDeValor, estadosEditables, formatosDocumento, maxBytesDocumento } from '@botonera/shared';
import { pool } from '../../db.js';
import { cifrar, descifrar } from '../../core/secretos.js';
import { descargarArchivo, subirArchivo, tipoPorContenido } from '../../core/storage.js';
import { emailValido, normalizarEmail, pedirCodigo, verificarCodigo } from '../../core/verificacion.js';
import {
  BUCKET,
  ErrorSolicitud,
  PROPOSITO_CODIGO,
  avisar,
  bloquear,
  cambiarEstado,
  configModulo,
  enTransaccion,
  enlaceSolicitud,
  hashToken,
  nombreTramite,
  nuevoToken,
  solicitudPorToken,
  solicitudPublica,
  tipoPublico,
  tiposPublicos,
  type FilaSolicitud,
} from './solicitudes.js';

export const publicoRouter = Router();

const extension: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Tope simple en memoria para pedidos que mandan mails sin código (ej. recuperar enlaces). */
const pedidosRecientes = new Map<string, number[]>();
function superaTope(clave: string, maximo: number, ventanaMs = 3_600_000) {
  const ahora = Date.now();
  const lista = (pedidosRecientes.get(clave) ?? []).filter((t) => t > ahora - ventanaMs);
  lista.push(ahora);
  pedidosRecientes.set(clave, lista);
  return lista.length > maximo;
}

const ipDe = (req: Request) => req.ip ?? 'desconocida';

/** Resuelve `:token` a la solicitud o responde 404. */
async function conSolicitud(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await solicitudPorToken(String(req.params.token));
    if (!s) {
      res.status(404).json({ error: 'El enlace no es válido. Pedí uno nuevo con tu mail.' });
      return;
    }
    res.locals.solicitud = s;
    next();
  } catch (e) {
    next(e);
  }
}
const solicitudDe = (res: Response) => res.locals.solicitud as FilaSolicitud;

function exigirEditable(s: FilaSolicitud) {
  if (!estadosEditables.includes(s.estado)) throw new ErrorSolicitud(409, 'La solicitud ya fue enviada y no se puede modificar en este estado.');
}

publicoRouter.get('/tipos', async (_req, res, next) => {
  try {
    res.json(await tiposPublicos());
  } catch (e) {
    next(e);
  }
});

/** Paso 1: mandar el código al mail. */
publicoRouter.post('/codigo', async (req, res, next) => {
  try {
    const email = normalizarEmail(String(req.body?.email ?? ''));
    if (!emailValido(email)) throw new ErrorSolicitud(400, 'Ingresá un mail válido.');
    const r = await pedirCodigo(email, PROPOSITO_CODIGO, ipDe(req));
    if (!r.ok) throw new ErrorSolicitud(429, 'Pediste demasiados códigos. Esperá un rato y volvé a intentar.');
    await avisar({
      para: email,
      asunto: `Tu código de verificación: ${r.codigo}`,
      titulo: 'Código de verificación',
      parrafos: [
        `Tu código para iniciar la solicitud del ${nombreTramite} es ${r.codigo}.`,
        'Vence en 15 minutos. Si no lo pediste, ignorá este mail.',
      ],
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Paso 2: con el código correcto se crea la solicitud y se entrega el enlace privado. */
publicoRouter.post('/solicitudes', async (req, res, next) => {
  try {
    const email = normalizarEmail(String(req.body?.email ?? ''));
    const codigo = String(req.body?.codigo ?? '').trim();
    const tipo = String(req.body?.tipo ?? '');
    const config = await configModulo();
    await tipoPublico(config, tipo); // valida que el tipo exista
    if (!emailValido(email) || !(await verificarCodigo(email, PROPOSITO_CODIGO, codigo))) {
      throw new ErrorSolicitud(400, 'El código no es correcto o ya venció. Pedí uno nuevo.');
    }
    const token = nuevoToken();
    const s = await enTransaccion(async (client) => {
      const { rows } = await client.query<{ id: string; numero: string }>(
        `insert into pagos.fito_solicitudes (token_hash, token_cifrado, tipo, email) values ($1, $2, $3, $4) returning id, numero`,
        [hashToken(token), cifrar(token), tipo, email],
      );
      await cambiarEstado(client, { id: rows[0].id, estado: 'borrador' }, 'borrador', { actor: 'solicitante', nota: 'Solicitud iniciada.' });
      return rows[0];
    });
    await avisar({
      para: email,
      asunto: `Solicitud ${s.numero}: tu enlace para continuar`,
      titulo: `Iniciaste la solicitud ${s.numero}`,
      parrafos: [
        'Con este enlace podés completar la solicitud cuando quieras, ver su estado y, una vez aprobada, hacer el pago.',
        'Es personal: no lo compartas.',
      ],
      boton: { texto: 'Continuar la solicitud', url: enlaceSolicitud(token) },
    });
    res.status(201).json({ token, numero: s.numero });
  } catch (e) {
    next(e);
  }
});

/** Reenvía al mail los enlaces de sus solicitudes. Siempre responde lo mismo: no revela si hay alguna. */
publicoRouter.post('/recuperar', async (req, res, next) => {
  try {
    const email = normalizarEmail(String(req.body?.email ?? ''));
    if (!emailValido(email)) throw new ErrorSolicitud(400, 'Ingresá un mail válido.');
    if (!superaTope(`email:${email}`, 3) && !superaTope(`ip:${ipDe(req)}`, 10)) {
      const { rows } = await pool.query<{ numero: string; token_cifrado: string; estado: string }>(
        `select numero, token_cifrado, estado from pagos.fito_solicitudes
          where lower(email) = $1 and estado not in ('emitida','rechazada','vencida')
          order by created_at desc limit 10`,
        [email],
      );
      if (rows.length) {
        await avisar({
          para: email,
          asunto: 'Tus solicitudes de fitosanitarios',
          titulo: 'Enlaces a tus solicitudes',
          parrafos: rows.map((r) => `${r.numero}: ${enlaceSolicitud(descifrar(r.token_cifrado))}`),
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

publicoRouter.get('/solicitudes/:token', conSolicitud, async (_req, res, next) => {
  try {
    res.json(await solicitudPublica(solicitudDe(res)));
  } catch (e) {
    next(e);
  }
});

/** Guarda los datos (no los documentos). Se puede guardar incompleto; al enviar se exige todo. */
publicoRouter.put('/solicitudes/:token/datos', conSolicitud, async (req, res, next) => {
  try {
    const s = solicitudDe(res);
    exigirEditable(s);
    const recibidos = req.body?.datos;
    if (!recibidos || typeof recibidos !== 'object') throw new ErrorSolicitud(400, 'Faltan los datos.');
    const tipo = await tipoPublico(await configModulo(), s.tipo);
    const datos: Record<string, string> = {};
    const errores: Record<string, string> = {};
    for (const r of tipo.requisitos) {
      if (r.tipo === 'documento') continue;
      const v = typeof recibidos[r.clave] === 'string' ? recibidos[r.clave].trim().slice(0, 500) : s.datos[r.clave] ?? '';
      if (v) datos[r.clave] = v;
      const error = errorDeValor(r, v);
      if (error) errores[r.clave] = error;
    }
    const cambiados = Object.keys({ ...datos, ...s.datos }).filter((k) => (datos[k] ?? '') !== (s.datos[k] ?? ''));
    await enTransaccion(async (client) => {
      await client.query('update pagos.fito_solicitudes set datos = $2, updated_at = now() where id = $1', [s.id, datos]);
      // Corregir un dato observado da la observación por resuelta.
      if (cambiados.length) {
        await client.query(
          `update pagos.fito_observaciones set resuelta_en = now()
            where solicitud_id = $1 and requisito = any($2) and resuelta_en is null`,
          [s.id, cambiados],
        );
      }
    });
    res.json({ ...(await solicitudPublica({ ...s, datos })), errores });
  } catch (e) {
    next(e);
  }
});

/**
 * Sube el documento de un requisito. El cuerpo es el archivo crudo; el nombre va en el
 * encabezado X-Nombre-Archivo (codificado). El tipo se comprueba por el contenido.
 */
publicoRouter.put(
  '/solicitudes/:token/documentos/:requisito',
  express.raw({ type: () => true, limit: maxBytesDocumento }),
  conSolicitud,
  async (req, res, next) => {
    try {
      const s = solicitudDe(res);
      exigirEditable(s);
      const tipo = await tipoPublico(await configModulo(), s.tipo);
      const requisito = tipo.requisitos.find((r) => r.clave === req.params.requisito && r.tipo === 'documento');
      if (!requisito) throw new ErrorSolicitud(400, 'Ese documento no corresponde a esta solicitud.');
      const contenido = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!contenido.length) throw new ErrorSolicitud(400, 'El archivo está vacío.');
      const mime = tipoPorContenido(contenido);
      if (!mime || !formatosDocumento[mime]) throw new ErrorSolicitud(400, `Formato no admitido. Subí un archivo ${Object.values(formatosDocumento).join(', ')}.`);
      let nombre = 'documento';
      try {
        nombre = decodeURIComponent(req.get('x-nombre-archivo') ?? '') || nombre;
      } catch {
        // nombre inválido: queda el genérico
      }
      nombre = nombre.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 150);
      const ruta = `solicitudes/${s.id}/${requisito.clave}/${randomUUID()}.${extension[mime]}`;
      await subirArchivo(BUCKET, ruta, contenido, mime);
      await enTransaccion(async (client) => {
        await bloquear(client, s.id);
        await client.query(
          `update pagos.fito_documentos set reemplazado_en = now()
            where solicitud_id = $1 and requisito = $2 and reemplazado_en is null`,
          [s.id, requisito.clave],
        );
        await client.query(
          `insert into pagos.fito_documentos (solicitud_id, requisito, ruta, nombre, tipo_mime, bytes, sha256)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [s.id, requisito.clave, ruta, nombre, mime, contenido.length, createHash('sha256').update(contenido).digest('hex')],
        );
        await client.query(
          `update pagos.fito_observaciones set resuelta_en = now()
            where solicitud_id = $1 and requisito = $2 and resuelta_en is null`,
          [s.id, requisito.clave],
        );
        await client.query('update pagos.fito_solicitudes set updated_at = now() where id = $1', [s.id]);
      });
      res.json(await solicitudPublica(s));
    } catch (e) {
      next(e);
    }
  },
);

/** La persona ve un documento que subió. Pasa por la API: el bucket es privado. */
publicoRouter.get('/solicitudes/:token/documentos/:id', conSolicitud, async (req, res, next) => {
  try {
    const s = solicitudDe(res);
    const { rows } = await pool.query<{ ruta: string; nombre: string; tipo_mime: string }>(
      'select ruta, nombre, tipo_mime from pagos.fito_documentos where id = $1 and solicitud_id = $2',
      [Number(req.params.id) || 0, s.id],
    );
    if (!rows[0]) throw new ErrorSolicitud(404, 'El documento no existe.');
    const archivo = await descargarArchivo(BUCKET, rows[0].ruta);
    res.setHeader('Content-Type', rows[0].tipo_mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].nombre)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(await archivo.arrayBuffer()));
  } catch (e) {
    next(e);
  }
});

/** Envía (o reenvía, después de corregir) la solicitud para revisión. */
publicoRouter.post('/solicitudes/:token/enviar', conSolicitud, async (_req, res, next) => {
  try {
    const s = solicitudDe(res);
    exigirEditable(s);
    const actual = await solicitudPublica(s);
    if (actual.pendientes.length) {
      res.status(400).json({ error: 'Faltan requisitos por completar.', pendientes: actual.pendientes });
      return;
    }
    const reenvio = s.estado === 'observada';
    await enTransaccion(async (client) => {
      const fila = await bloquear(client, s.id);
      exigirEditable(fila);
      // Al reenviar, las observaciones generales se dan por atendidas.
      await client.query(
        'update pagos.fito_observaciones set resuelta_en = now() where solicitud_id = $1 and requisito is null and resuelta_en is null',
        [s.id],
      );
      await cambiarEstado(client, fila, 'enviada', { actor: 'solicitante', nota: reenvio ? 'Reenviada con las correcciones.' : null }, { enviada_en: new Date() });
    });
    await avisar({
      para: s.email,
      asunto: `Solicitud ${s.numero}: ${reenvio ? 'recibimos las correcciones' : 'la recibimos'}`,
      titulo: reenvio ? 'Recibimos las correcciones' : 'Recibimos tu solicitud',
      parrafos: [
        `Tu solicitud ${s.numero} quedó para revisión de los técnicos del área.`,
        'Te vamos a avisar por este medio cuando la revisen. También podés ver el estado con tu enlace.',
      ],
    });
    res.json(await solicitudPublica({ ...s, estado: 'enviada' }));
  } catch (e) {
    next(e);
  }
});
