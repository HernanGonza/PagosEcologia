import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { modulosRouter } from './routes/modulos.js';
import { adminRouter } from './routes/admin.js';
import { panelesRouter } from './routes/paneles.js';
import { fitosanitariosRouter } from './modules/fitosanitarios/index.js';
import { descargarArchivo, storageLocalDir } from './core/storage.js';
import { exigirCorreoReal } from './core/correo.js';
import { exigirSecretoDeCodigos } from './core/verificacion.js';

// En producción no se arranca con la configuración de desarrollo.
exigirCorreoReal();
exigirSecretoDeCodigos();
// En producción hay que declarar cuántos proxies hay delante: confiar en cualquier IP privada permitiría falsear X-Forwarded-For desde la red interna.
if (process.env.NODE_ENV === 'production' && !process.env.TRUST_PROXY?.trim()) {
  throw new Error('Falta TRUST_PROXY en el .env (cantidad de proxies delante de la API, ej. 1). Sin eso los topes por IP se pueden falsear.');
}

const app = express();
// Detrás del proxy (nginx/caddy) la IP real llega en X-Forwarded-For; se usa para los topes anti-abuso.
// TRUST_PROXY=<cantidad de proxies> (ej. 1 si hay uno solo, como HAProxy) es lo más estricto; por defecto (solo desarrollo) confía en proxies de red privada.
const proxy = process.env.TRUST_PROXY?.trim();
app.set('trust proxy', proxy ? (/^\d+$/.test(proxy) ? Number(proxy) : proxy) : 'loopback, linklocal, uniquelocal');
app.use(cors());
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/modulos', modulosRouter);
app.use('/api/admin', adminRouter);
app.use('/api/paneles', panelesRouter);
app.use('/api/fitosanitarios', fitosanitariosRouter);

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

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Ocurrió un error inesperado.' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API escuchando en :${port}`));
