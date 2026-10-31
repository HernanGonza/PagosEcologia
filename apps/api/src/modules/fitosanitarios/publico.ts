/**
 * Parte pública de las solicitudes: sin cuenta. La persona verifica su mail con un código, crea la
 * solicitud y entra con una sesión (cookie HttpOnly). Para volver, canjea un enlace de un solo uso
 * que le llega por mail (`POST /sesion`). Ver README-mails-y-seguridad.md.
 */
import { createHash, randomUUID } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { errorDeValor, estadosEditables, type EstadoSolicitud, formatosDocumento, maxBytesDocumento } from '@botonera/shared';
import { pool } from '../../db.js';
import { descargarArchivo, subirArchivo, tipoPorContenido } from '../../core/storage.js';
import { emailCanonico, emailValido, normalizarEmail, pedirCodigo, verificarCodigo } from '../../core/verificacion.js';
import { renovacionSinCambios } from './renovaciones.js';
import { esRepresentante } from './titulares.js';
import {
  BUCKET,
  ENLACE_INICIO,
  ENLACE_SESION,
  ErrorSolicitud,
  PROPOSITO_CODIGO,
  PROPOSITO_PERSONA,
  PROPOSITO_RECUPERAR,
  SESION_MAXIMO_MINUTOS,
  SQL_ADMITE_ENLACE,
  SQL_EN_CURSO,
  abrirSesion,
  avisar,
  bloquear,
  cambiarEstado,
  canjearEnlace,
  configModulo,
  descartarToken,
  emitirToken,
  enTransaccion,
  enlaceSolicitud,
  enlaceVigente,
  nombreTramite,
  SQL_HOY,
  personaPorSesion,
  solicitudDeLaPersona,
  solicitudPorSesion,
  solicitudPublica,
  textoDuracion,
  tipoPublico,
  tiposPublicos,
  vencerAnteriores,
  type FilaSolicitud,
} from './solicitudes.js';

export const publicoRouter = Router();

const extension: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export const ipDe = (req: Request) => req.ip ?? 'desconocida';

/** Solicitudes sin enviar que puede tener un mismo mail (evita llenar el almacenamiento de borradores). */
const MAX_BORRADORES = 3;
/** Tope de bytes subidos por solicitud, contando los documentos reemplazados (que se conservan). */
const MAX_BYTES_POR_SOLICITUD = 100 * 1024 * 1024;
/** Tope de bytes por casilla (todas sus solicitudes y variantes). Hasta que exista la limpieza programada nada borra los archivos. */
const MAX_BYTES_POR_CASILLA = 300 * 1024 * 1024;

// --- Sesión (cookie), origen y cabeceras --------------------------------------------------------

const cookieSegura = () => (process.env.WEB_URL ?? '').trim().startsWith('https://');
// Con https la cookie lleva el prefijo __Host-: el navegador exige Secure, Path=/ y sin Domain, así que
// un subdominio comprometido no puede pisarla. En desarrollo (http) va sin prefijo.
const nombreCookie = () => (cookieSegura() ? '__Host-fito_sesion' : 'fito_sesion');

export function leerCookie(req: Request): string {
  const par = (req.headers.cookie ?? '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${nombreCookie()}=`));
  return par ? par.slice(nombreCookie().length + 1) : '';
}

/** HttpOnly (el JavaScript no la ve) y SameSite=Strict (no viaja en pedidos de otros sitios). */
export function ponerCookie(res: Response, valor: string) {
  const ruta = cookieSegura() ? '/' : '/api/fitosanitarios'; // __Host- exige Path=/
  res.append('Set-Cookie', `${nombreCookie()}=${valor}; Path=${ruta}; HttpOnly; SameSite=Strict; Max-Age=${SESION_MAXIMO_MINUTOS * 60}${cookieSegura() ? '; Secure' : ''}`);
}

function origenesPermitidos(): string[] {
  const lista = [process.env.WEB_URL ?? 'http://localhost:5173', ...(process.env.ORIGENES_PERMITIDOS ?? '').split(',')];
  return lista
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap((x) => {
      try {
        return [new URL(x).origin];
      } catch {
        return [];
      }
    });
}

// Estas respuestas son personales: nada de cachés, nada de Referer hacia otros sitios.
export function seguridadPublica(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Defensa extra contra CSRF (además de SameSite=Strict): un pedido que modifica datos y trae
  // `Origin` tiene que venir de nuestro propio sitio.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origen = req.get('origin');
    if (origen && !origenesPermitidos().includes(origen)) {
      res.status(403).json({ error: 'Pedido no permitido desde ese origen.' });
      return;
    }
  }
  next();
}
publicoRouter.use(seguridadPublica);

/** Resuelve la cookie de sesión a la solicitud o responde 401 (`enlace_invalido`: el front manda a pedir otro enlace). */
async function conSesion(req: Request, res: Response, next: NextFunction) {
  try {
    const cookie = leerCookie(req);
    let s = cookie ? await solicitudPorSesion(cookie) : null;
    // Una sesión de persona (tablero) puede abrir las solicitudes de su propio mail indicando el número.
    const numero = req.get('x-solicitud');
    if (!s && cookie && numero) {
      const persona = await personaPorSesion(cookie);
      if (persona) s = await solicitudDeLaPersona(persona.emailCanonico, numero);
    }
    if (!s) {
      res.status(401).json({ error: 'Tu sesión venció o el enlace ya no vale. Pedí uno nuevo con tu mail.', codigo: 'enlace_invalido' });
      return;
    }
    res.locals.solicitud = s;
    next();
  } catch (e) {
    next(e);
  }
}
const solicitudDe = (res: Response) => res.locals.solicitud as FilaSolicitud;
export const clienteDe = (req: Request) => ({ ip: ipDe(req), userAgent: req.get('user-agent') });

/** Fecha de vencimiento AAAA-MM-DD, entre hace 10 años y dentro de 30. Null si no se pide. */
function leerVencimiento(valor: string | undefined, obligatoria: boolean): string | null {
  const v = (valor ?? '').trim();
  if (!v) {
    if (obligatoria) throw new ErrorSolicitud(400, 'Indicá la fecha de vencimiento del documento.');
    return null;
  }
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
  const ahora = Date.now();
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v || d.getTime() < ahora - 10 * 365 * 864e5 || d.getTime() > ahora + 30 * 365 * 864e5) {
    throw new ErrorSolicitud(400, 'La fecha de vencimiento no es válida.');
  }
  return v;
}

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
    const recuperar = req.body?.para === 'recuperar';
    const persona = req.body?.para === 'persona';
    const r = await pedirCodigo(email, persona ? PROPOSITO_PERSONA : recuperar ? PROPOSITO_RECUPERAR : PROPOSITO_CODIGO, ipDe(req));
    if (!r.ok) throw new ErrorSolicitud(429, 'Pediste demasiados códigos. Esperá un rato y volvé a intentar.');
    // codigo null: se pidió uno hace menos de 1 minuto y sigue vigente; no se manda otro.
    if (r.codigo) await avisar({
      para: email,
      asunto: `Tu código de verificación: ${r.codigo}`,
      titulo: 'Código de verificación',
      parrafos: [
        persona
          ? `Tu código para ver tus certificados del ${nombreTramite} es ${r.codigo}.`
          : recuperar
          ? `Tu código para recuperar el enlace de tus solicitudes del ${nombreTramite} es ${r.codigo}.`
          : `Tu código para iniciar la solicitud del ${nombreTramite} es ${r.codigo}.`,
        'Vence en 15 minutos. Si no lo pediste, ignorá este mail.',
      ],
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Paso 2: con el código correcto se crea la solicitud y se entrega el enlace privado.
 * Si ese mail ya tiene solicitudes en curso, antes de crear otra se las devuelve (`existentes`,
 * con su enlace: el código ya probó que el mail es de quien pregunta) y el código sigue vigente.
 * Para crear igual, el front repite el pedido con `nueva: true`.
 */
publicoRouter.post('/solicitudes', async (req, res, next) => {
  try {
    const email = normalizarEmail(String(req.body?.email ?? ''));
    const codigo = String(req.body?.codigo ?? '').trim();
    const tipo = String(req.body?.tipo ?? '');
    const nueva = req.body?.nueva === true;
    const config = await configModulo();
    await tipoPublico(config, tipo); // valida que el tipo exista
    const { rows: enCurso } = emailValido(email)
      ? await pool.query<{ id: string; numero: string; tipo: string; estado: string; updated_at: Date }>(
          `select id, numero, tipo, estado, updated_at from pagos.fito_solicitudes
            where lower(email) = $1 and ${SQL_EN_CURSO}
            order by created_at desc limit 10`,
          [email],
        )
      : { rows: [] };
    const consumir = nueva || !enCurso.length;
    if (!emailValido(email) || !(await verificarCodigo(email, PROPOSITO_CODIGO, codigo, { consumir }))) {
      throw new ErrorSolicitud(400, 'El código no es correcto o ya venció. Pedí uno nuevo.');
    }
    if (!consumir) {
      res.json({
        // Sin enlaces: para seguir una, el front llama a /continuar (que consume el código).
        existentes: enCurso.map((r) => ({
          numero: r.numero,
          tipo: r.tipo,
          tipoNombre: config.solicitud.tipos.find((t) => t.slug === r.tipo)?.nombre ?? r.tipo,
          estado: r.estado,
          actualizadaEn: r.updated_at,
        })),
      });
      return;
    }
    const { rows: borradores } = await pool.query<{ n: string }>(
      "select count(*) as n from pagos.fito_solicitudes where email_canonico = $1 and estado = 'borrador'",
      [emailCanonico(email)],
    );
    if (Number(borradores[0].n) >= MAX_BORRADORES) {
      throw new ErrorSolicitud(429, `Ya tenés ${MAX_BORRADORES} solicitudes sin enviar. Terminá o enviá alguna antes de iniciar otra.`);
    }
    let token = '';
    const s = await enTransaccion(async (client) => {
      const { rows } = await client.query<{ id: string; numero: string }>(
        `insert into pagos.fito_solicitudes (tipo, email, email_canonico) values ($1, $2, $3) returning id, numero`,
        [tipo, email, emailCanonico(email)],
      );
      await cambiarEstado(client, { id: rows[0].id, estado: 'borrador' }, 'borrador', { actor: 'solicitante', nota: 'Solicitud iniciada.' });
      token = await emitirToken(rows[0].id, client, ENLACE_INICIO);
      return rows[0];
    });
    // La persona acaba de probar su mail: entra directo, con sesión. El enlace del mail es para volver más tarde.
    ponerCookie(res, await abrirSesion(s.id, clienteDe(req)));
    await avisar({
      para: email,
      asunto: `Solicitud ${s.numero}: tu enlace para continuar`,
      titulo: `Iniciaste la solicitud ${s.numero}`,
      parrafos: [
        'Podés seguir tu solicitud con este enlace, o pedir uno nuevo con tu mail cuando quieras.',
        `Es de un solo uso, personal (no lo compartas) y se puede abrir durante ${textoDuracion(ENLACE_INICIO.ventanaMin)}. Nunca te vamos a pedir contraseñas ni datos de tarjeta por mail.`,
      ],
      boton: { texto: 'Continuar la solicitud', url: enlaceSolicitud(token) },
    });
    res.status(201).json({ numero: s.numero });
  } catch (e) {
    next(e);
  }
});

/**
 * Seguir una solicitud en curso tras verificar el mail. Consume el código y abre una sesión para esa
 * solicitud (las sesiones anteriores de esa solicitud se cierran). Así el código de "iniciar" no
 * sirve para sacar acceso a todas las solicitudes ni para repetir el pedido durante 15 minutos.
 */
publicoRouter.post('/continuar', async (req, res, next) => {
  try {
    const email = normalizarEmail(String(req.body?.email ?? ''));
    const numero = String(req.body?.numero ?? '');
    if (!emailValido(email) || !(await verificarCodigo(email, PROPOSITO_CODIGO, String(req.body?.codigo ?? '').trim()))) {
      throw new ErrorSolicitud(400, 'El código no es correcto o ya venció. Pedí uno nuevo.');
    }
    // Por mail verificado Y número: con el número de otra persona no se obtiene nada.
    const { rows } = await pool.query<{ id: string }>(
      `select id from pagos.fito_solicitudes where lower(email) = $1 and numero = $2 and ${SQL_ADMITE_ENLACE}`,
      [email, numero],
    );
    if (!rows[0]) throw new ErrorSolicitud(404, 'No encontramos esa solicitud.');
    ponerCookie(res, await abrirSesion(rows[0].id, clienteDe(req)));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

async function recuperarEnlaces(email: string) {
  const { rows } = await pool.query<{ id: string; numero: string }>(
    `select id, numero from pagos.fito_solicitudes
      where lower(email) = $1 and ${SQL_ADMITE_ENLACE}
      order by created_at desc limit 10`,
    [email],
  );
  if (!rows.length) return;
  const emitidos = await Promise.all(rows.map(async (r) => ({ id: r.id, numero: r.numero, token: await emitirToken(r.id, pool, ENLACE_SESION) })));
  // Justo antes de enviar: si otro enlace más nuevo ya venció a alguno, no se manda un enlace muerto.
  const vigentes: typeof emitidos = [];
  for (const e of emitidos) if (await enlaceVigente(e.token)) vigentes.push(e);
  if (!vigentes.length) return;
  const salio = await avisar({
    para: email,
    asunto: 'Tus solicitudes de fitosanitarios',
    titulo: 'Enlaces a tus solicitudes',
    parrafos: [
      ...vigentes.map((e) => `${e.numero}: ${enlaceSolicitud(e.token)}`),
      `Cada enlace es de un solo uso y se puede abrir durante ${textoDuracion(ENLACE_SESION.ventanaMin)}. Un enlace nuevo deja sin efecto los anteriores. Nunca te vamos a pedir contraseñas ni datos de tarjeta por mail.`,
    ],
  });
  // Solo si el mail salió se vencen los enlaces anteriores; si no, la persona conserva los que tenía.
  for (const e of vigentes) {
    if (salio) await vencerAnteriores(e.id, e.token);
    else await descartarToken(e.token);
  }
}

/**
 * Reenvía al mail enlaces nuevos de sus solicitudes (invalidan los anteriores). Exige el código
 * que se mandó a ese mail: sin él, cualquiera que conozca un mail podría sacar a esa persona de
 * su sesión. Con código válido responde siempre lo mismo: no revela si hay solicitudes.
 */
publicoRouter.post('/recuperar', async (req, res, next) => {
  try {
    const email = normalizarEmail(String(req.body?.email ?? ''));
    if (!emailValido(email)) throw new ErrorSolicitud(400, 'Ingresá un mail válido.');
    if (!(await verificarCodigo(email, PROPOSITO_RECUPERAR, String(req.body?.codigo ?? '').trim()))) {
      throw new ErrorSolicitud(400, 'El código no es correcto o ya venció. Pedí uno nuevo.');
    }
    // La respuesta no espera al envío: si tardara más cuando hay solicitudes, el tiempo delataría qué mails iniciaron un trámite.
    // No hace falta un tope extra: cada recuperación consume un código, y los pedidos de código ya están limitados en la base.
    void recuperarEnlaces(email).catch((e) => console.error(`No se pudieron recuperar los enlaces: ${(e as Error).message}`));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Canjea el enlace del mail (de un solo uso) por una sesión: la API responde con la cookie y el
 * enlace deja de servir. Si el enlace venció, ya se usó o lo reemplazó uno más nuevo: 404 y el front
 * manda a pedir otro.
 */
publicoRouter.post('/sesion', async (req, res, next) => {
  try {
    const r = await canjearEnlace(String(req.body?.token ?? ''), clienteDe(req));
    if (!('cookie' in r)) {
      const usado = r.motivo === 'usado';
      res.status(404).json({
        error: usado ? 'Este enlace ya se usó. Pedí uno nuevo con tu mail.' : 'El enlace no es válido o venció. Pedí uno nuevo con tu mail.',
        codigo: 'enlace_invalido',
        motivo: r.motivo,
        usadoEn: usado ? r.usadoEn.toISOString() : undefined,
      });
      return;
    }
    ponerCookie(res, r.cookie);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

publicoRouter.get('/solicitud', conSesion, async (_req, res, next) => {
  try {
    res.json(await solicitudPublica(solicitudDe(res)));
  } catch (e) {
    next(e);
  }
});

/** Guarda los datos (no los documentos). Se puede guardar incompleto; al enviar se exige todo. */
publicoRouter.put('/solicitud/datos', conSesion, async (req, res, next) => {
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
  '/solicitud/documentos/:requisito',
  express.raw({ type: () => true, limit: maxBytesDocumento }),
  conSesion,
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
      const { rows: usado } = await pool.query<{ total: string }>('select coalesce(sum(bytes), 0) as total from pagos.fito_documentos where solicitud_id = $1', [s.id]);
      if (Number(usado[0].total) + contenido.length > MAX_BYTES_POR_SOLICITUD) {
        throw new ErrorSolicitud(413, 'Superaste el espacio máximo de archivos para esta solicitud.');
      }
      const { rows: casilla } = await pool.query<{ total: string }>(
        `select coalesce(sum(d.bytes), 0) as total from pagos.fito_documentos d
           join pagos.fito_solicitudes x on x.id = d.solicitud_id where x.email_canonico = $1`,
        [emailCanonico(s.email)],
      );
      if (Number(casilla[0].total) + contenido.length > MAX_BYTES_POR_CASILLA) {
        throw new ErrorSolicitud(413, 'Esta casilla de mail superó el espacio máximo de archivos. Escribinos si necesitás más.');
      }
      const venceEn = leerVencimiento(req.get('x-vence-en'), !!requisito.venceEn);
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
          `insert into pagos.fito_documentos (solicitud_id, requisito, ruta, nombre, tipo_mime, bytes, sha256, vence_en)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [s.id, requisito.clave, ruta, nombre, mime, contenido.length, createHash('sha256').update(contenido).digest('hex'), venceEn],
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

/** Corrige la fecha de vencimiento de un documento ya subido (sin volver a subirlo). */
publicoRouter.put('/solicitud/documentos/:requisito/vencimiento', conSesion, async (req, res, next) => {
  try {
    const s = solicitudDe(res);
    exigirEditable(s);
    const tipo = await tipoPublico(await configModulo(), s.tipo);
    const requisito = tipo.requisitos.find((r) => r.clave === req.params.requisito && r.tipo === 'documento' && r.venceEn);
    if (!requisito) throw new ErrorSolicitud(400, 'Ese documento no tiene fecha de vencimiento.');
    const venceEn = leerVencimiento(String(req.body?.venceEn ?? ''), true);
    const { rowCount } = await pool.query(
      'update pagos.fito_documentos set vence_en = $3 where solicitud_id = $1 and requisito = $2 and reemplazado_en is null',
      [s.id, requisito.clave, venceEn],
    );
    if (!rowCount) throw new ErrorSolicitud(404, 'Primero subí el documento.');
    res.json(await solicitudPublica(s));
  } catch (e) {
    next(e);
  }
});

/** La persona ve un documento que subió. Pasa por la API: el bucket es privado. */
publicoRouter.get('/solicitud/documentos/:id', conSesion, async (req, res, next) => {
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

/** Envía (o reenvía, después de corregir) la solicitud para revisión. Una renovación sin cambios se aprueba sola. */
publicoRouter.post('/solicitud/enviar', conSesion, async (_req, res, next) => {
  try {
    const s = solicitudDe(res);
    exigirEditable(s);
    const actual = await solicitudPublica(s);
    if (actual.pendientes.length) {
      res.status(400).json({ error: 'Faltan requisitos por completar.', pendientes: actual.pendientes });
      return;
    }
    // Una renovación solo la envía quien sigue siendo representante del titular (pudo haber sido dado de baja desde que la armó).
    if (s.tipo_solicitud === 'renovacion' && !(s.titular_id && (await esRepresentante(emailCanonico(s.email), s.titular_id)))) {
      throw new ErrorSolicitud(403, 'Ya no sos representante de este titular: no podés enviar la renovación.');
    }
    const reenvio = s.estado === 'observada';
    const sinRevision = s.tipo_solicitud === 'renovacion' && !reenvio && (await renovacionSinCambios(s));
    const { aprobacionDias = 30 } = (await configModulo()).solicitud;
    const { rows: plazo } = await pool.query<{ d: string }>(`select (${SQL_HOY} + $1::int)::text as d`, [aprobacionDias]);
    await enTransaccion(async (client) => {
      const fila = await bloquear(client, s.id);
      exigirEditable(fila);
      // Al reenviar, las observaciones generales se dan por atendidas.
      await client.query(
        'update pagos.fito_observaciones set resuelta_en = now() where solicitud_id = $1 and requisito is null and resuelta_en is null',
        [s.id],
      );
      await cambiarEstado(client, fila, 'enviada', { actor: 'solicitante', nota: reenvio ? 'Reenviada con las correcciones.' : null }, { enviada_en: new Date() });
      if (sinRevision) {
        // Renovación sin cambios y con los documentos vigentes: no hace falta que la revise un técnico.
        await cambiarEstado(
          client, { id: fila.id, estado: 'enviada' }, 'aprobada',
          { actor: 'sistema', nota: 'Renovación sin cambios y con documentos vigentes: aprobada automáticamente.' },
          { resuelta_en: new Date(), aprobacion_vence: plazo[0].d },
        );
      }
    });
    await avisar({
      para: s.email,
      asunto: `Solicitud ${s.numero}: ${sinRevision ? 'renovación aprobada' : reenvio ? 'recibimos las correcciones' : 'la recibimos'}`,
      titulo: sinRevision ? 'Tu renovación está aprobada' : reenvio ? 'Recibimos las correcciones' : 'Recibimos tu solicitud',
      parrafos: sinRevision
        ? [
            `Tu renovación ${s.numero} no tuvo cambios y tus documentos están vigentes, así que quedó aprobada sin revisión.`,
            `Tenés ${aprobacionDias} días para pagar la tasa. Entrá con tu mail a "Mis certificados" para continuar.`,
          ]
        : [
            `Tu solicitud ${s.numero} quedó para revisión de los técnicos del área.`,
            'Te vamos a avisar por este medio cuando la revisen. También podés ver el estado volviendo a entrar con tu mail.',
          ],
    });
    res.json(await solicitudPublica({ ...s, estado: sinRevision ? 'aprobada' : 'enviada' }));
  } catch (e) {
    next(e);
  }
});
