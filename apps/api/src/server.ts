import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { modulosRouter } from './routes/modulos.js';
import { adminRouter } from './routes/admin.js';
import { panelesRouter } from './routes/paneles.js';
import { sistemaRouter } from './routes/sistema.js';
import { fitosanitariosRouter } from './modules/fitosanitarios/index.js';
import { consultoresRouter } from './modules/consultores/index.js';
import { reservasRouter } from './modules/reservas/index.js';
import { descargarArchivo, storageLocalDir } from './core/storage.js';
import { correoEnConsola, exigirCorreoReal } from './core/correo.js';
import { buzonRouter } from './core/buzon-correo.js';
import { exigirSecretoDeCodigos } from './core/verificacion.js';
import { moduloActivo } from './core/modulo-activo.js';
import { exigirMigraciones } from './core/migraciones.js';

// En producción no se arranca con la configuración de desarrollo.
exigirCorreoReal();
exigirSecretoDeCodigos();
// En producción hay que declarar cuántos proxies hay delante: confiar en cualquier IP privada permitiría falsear X-Forwarded-For desde la red interna.
if (process.env.NODE_ENV === 'production' && !process.env.TRUST_PROXY?.trim()) {
  throw new Error('Falta TRUST_PROXY en el .env (cantidad de proxies delante de la API, ej. 1). Sin eso los topes por IP se pueden falsear.');
}

// Guardas de producción: nada de configuración de desarrollo.
if (process.env.NODE_ENV === 'production') {
  if (process.env.PAYMENT_PROVIDER !== 'macroclick') throw new Error('En producción PAYMENT_PROVIDER debe ser macroclick: el proveedor mock acepta cualquier webhook.');
  if (!(process.env.CORS_ORIGINS ?? process.env.WEB_URL)?.trim()) throw new Error('Falta WEB_URL (o CORS_ORIGINS) en el .env: orígenes permitidos para la API.');
}
await exigirMigraciones();

const app = express();
// No delatar con qué está hecho el servidor.
app.disable('x-powered-by');
// Detrás del proxy (nginx/caddy) la IP real llega en X-Forwarded-For; se usa para los topes anti-abuso.
// TRUST_PROXY=<cantidad de proxies> (ej. 1 si hay uno solo, como HAProxy) es lo más estricto; por defecto (solo desarrollo) confía en proxies de red privada.
const proxy = process.env.TRUST_PROXY?.trim();
app.set('trust proxy', proxy ? (/^\d+$/.test(proxy) ? Number(proxy) : proxy) : 'loopback, linklocal, uniquelocal');
// En producción solo los orígenes declarados; en desarrollo (Vite con proxy) no hace falta restringir.
const origenes = (process.env.CORS_ORIGINS ?? process.env.WEB_URL ?? '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
app.use(cors(process.env.NODE_ENV === 'production' ? { origin: origenes } : undefined));
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
// Buzón de demostración: solo existe si los mails no se envían (MAIL_PROVIDER=consola, nunca en producción).
if (correoEnConsola()) app.use('/api/mail', buzonRouter);
app.use('/api/modulos', modulosRouter);
app.use('/api/admin', adminRouter);
app.use('/api/paneles', panelesRouter);
app.use('/api/sistema', sistemaRouter);
app.use('/api/fitosanitarios', moduloActivo('fitosanitarios'), fitosanitariosRouter);
app.use('/api/consultores', moduloActivo('consultores'), consultoresRouter);
app.use('/api/reservas', moduloActivo('reservas'), reservasRouter);

// Solo con STORAGE_LOCAL_DIR (desarrollo sin red): hace de "enlace firmado" para los archivos locales.
if (storageLocalDir()) {
  app.get('/api/dev-storage/:bucket/*ruta', async (req, res, next) => {
    try {
      const { bucket, ruta } = req.params as unknown as { bucket: string; ruta: string[] };
      const archivo = await descargarArchivo(bucket, ruta.join('/'));
      res.type(archivo.headers.get('content-type') ?? 'application/octet-stream').send(Buffer.from(await archivo.arrayBuffer()));
    } catch {
      next();
    }
  });
}

// Rutas que no existen: JSON en vez de la página "Cannot GET …" de Express.
app.use((_req, res) => {
  res.status(404).json({ error: 'No encontramos lo que buscás.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const tipo = (error as { type?: string }).type;
  // Errores del pedido (no del servidor): un JSON mal formado o demasiado grande no es un 500.
  if (tipo === 'entity.parse.failed') {
    res.status(400).json({ error: 'El pedido no es válido.' });
    return;
  }
  if (tipo === 'entity.too.large') {
    res.status(413).json({ error: 'El pedido es demasiado grande.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Ocurrió un error inesperado.' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API escuchando en :${port}`));
