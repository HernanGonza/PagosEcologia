import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { modulosRouter } from './routes/modulos.js';
import { adminRouter } from './routes/admin.js';
import { panelesRouter } from './routes/paneles.js';
import { fitosanitariosRouter } from './modules/fitosanitarios/index.js';

const app = express();
// Detrás del proxy (nginx/caddy) la IP real llega en X-Forwarded-For; se usa para los topes anti-abuso.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(cors());
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/modulos', modulosRouter);
app.use('/api/admin', adminRouter);
app.use('/api/paneles', panelesRouter);
app.use('/api/fitosanitarios', fitosanitariosRouter);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Ocurrió un error inesperado.' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API escuchando en :${port}`));
