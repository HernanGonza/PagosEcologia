import express from 'express';
import cors from 'cors';
import { modulosRouter } from './routes/modulos.js';
import { adminRouter } from './routes/admin.js';
import { fitosanitariosRouter } from './modules/fitosanitarios/index.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/modulos', modulosRouter);
app.use('/api/admin', adminRouter);
app.use('/api/fitosanitarios', fitosanitariosRouter);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API escuchando en :${port}`));
