/**
 * Buzón de mails de demostración. Con MAIL_PROVIDER=consola los mails no se envían: se imprimen en la consola
 * y además se guardan acá para mostrarlos en una página (GET /api/mail, la pantalla está en docker/mail/).
 *
 * Guarda los últimos MAX en memoria y, si MAIL_BUZON_ARCHIVO está definido, también en un archivo JSONL
 * (para que sobrevivan a un reinicio del contenedor: montar un volumen en esa carpeta).
 * Los mails llevan códigos de verificación y enlaces de acceso: es solo para pruebas, nunca con datos reales.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Mail } from './correo.js';

const MAX = 200;

export interface MailGuardado extends Mail {
  id: number;
  fecha: string;
}

const archivo = () => (process.env.MAIL_BUZON_ARCHIVO ?? '').trim();
let mails: MailGuardado[] = [];
let siguiente = 1;

function cargar() {
  const ruta = archivo();
  if (!ruta || !existsSync(ruta)) return;
  try {
    mails = readFileSync(ruta, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as MailGuardado];
        } catch {
          return [];
        }
      })
      .slice(-MAX);
    siguiente = (mails.at(-1)?.id ?? 0) + 1;
  } catch (e) {
    console.error(`No se pudo leer el buzón de mails (${ruta}): ${(e as Error).message}`);
  }
}
cargar();

export function guardarMail(m: Mail) {
  const g: MailGuardado = { id: siguiente++, fecha: new Date().toISOString(), para: m.para, asunto: m.asunto, texto: m.texto, html: m.html };
  mails.push(g);
  if (mails.length > MAX) mails = mails.slice(-MAX);
  const ruta = archivo();
  if (!ruta) return;
  try {
    mkdirSync(dirname(ruta), { recursive: true });
    appendFileSync(ruta, JSON.stringify(g) + '\n');
  } catch (e) {
    console.error(`No se pudo guardar el mail en ${ruta}: ${(e as Error).message}`);
  }
}

/** Si MAIL_PANEL_CLAVE está definida, la pantalla la pide (cabecera X-Mail-Clave). Sin clave, el buzón es abierto. */
function conClave(req: Request, res: Response, next: NextFunction) {
  const clave = (process.env.MAIL_PANEL_CLAVE ?? '').trim();
  if (clave && req.get('x-mail-clave') !== clave) {
    res.status(401).json({ error: 'Clave incorrecta.' });
    return;
  }
  next();
}

export const buzonRouter = Router();
buzonRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/** Mails más nuevos primero. `?desde=<id>` devuelve solo los posteriores (la pantalla consulta cada pocos segundos). */
buzonRouter.get('/', conClave, (req, res) => {
  const desde = Number(req.query.desde ?? 0) || 0;
  res.json({ requiereClave: Boolean((process.env.MAIL_PANEL_CLAVE ?? '').trim()), mails: mails.filter((m) => m.id > desde).reverse() });
});

buzonRouter.delete('/', conClave, (_req, res) => {
  mails = [];
  const ruta = archivo();
  if (ruta) {
    try {
      writeFileSync(ruta, '');
    } catch {
      /* el buzón en memoria ya quedó vacío */
    }
  }
  res.json({ ok: true });
});
