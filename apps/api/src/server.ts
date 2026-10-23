import express from 'express';
import cors from 'cors';
import { modulosRouter } from './routes/modulos.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/modulos', modulosRouter);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API escuchando en :${port}`));
