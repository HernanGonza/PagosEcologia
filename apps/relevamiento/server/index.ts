import express from 'express';
import { createServer as createVite } from 'vite';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const KINDS = ['paso', 'concepto', 'documento', 'campo'] as const;

type Row = { id: number; titulo: string; data: string; creado: string; actualizado: string };
type ItemRow = { id: number; proceso_id: number; kind: string; orden: number; data: string };

const proceso = (r: Row) => ({ id: r.id, titulo: r.titulo, creado: r.creado, actualizado: r.actualizado, ...JSON.parse(r.data) });

function completo(id: number) {
  const r = db.prepare('SELECT * FROM procesos WHERE id = ?').get(id) as Row | undefined;
  if (!r) return null;
  const items = db.prepare('SELECT * FROM items WHERE proceso_id = ? ORDER BY orden').all(id) as ItemRow[];
  const out: Record<string, unknown[]> = Object.fromEntries(KINDS.map((k) => [k, []]));
  for (const it of items) out[it.kind]?.push({ ...JSON.parse(it.data) });
  return { ...proceso(r), items: out };
}

function guardar(id: number, body: any) {
  const { titulo = '', items = {}, id: _i, creado: _c, actualizado: _a, ...resto } = body;
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE procesos SET titulo = ?, data = ?, actualizado = datetime('now','localtime') WHERE id = ?")
      .run(titulo, JSON.stringify(resto), id);
    db.prepare('DELETE FROM items WHERE proceso_id = ?').run(id);
    const ins = db.prepare('INSERT INTO items (proceso_id, kind, orden, data) VALUES (?,?,?,?)');
    for (const k of KINDS) (items[k] ?? []).forEach((d: unknown, i: number) => ins.run(id, k, i, JSON.stringify(d)));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/procesos', (_req, res) => {
  const rows = db.prepare('SELECT * FROM procesos ORDER BY actualizado DESC').all() as Row[];
  const cuenta = db.prepare('SELECT proceso_id, kind, COUNT(*) n FROM items GROUP BY proceso_id, kind').all() as any[];
  res.json(rows.map((r) => ({
    ...proceso(r),
    cuenta: Object.fromEntries(cuenta.filter((c) => c.proceso_id === r.id).map((c) => [c.kind, c.n])),
  })));
});
app.post('/api/procesos', (req, res) => {
  const { id } = db.prepare('INSERT INTO procesos (titulo, data) VALUES (?, ?) RETURNING id')
    .get(req.body?.titulo ?? '', JSON.stringify(req.body?.data ?? {})) as { id: number };
  res.json(completo(id));
});
app.get('/api/procesos/:id', (req, res) => {
  const p = completo(Number(req.params.id));
  p ? res.json(p) : res.status(404).json({ error: 'no existe' });
});
app.put('/api/procesos/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!completo(id)) return void res.status(404).json({ error: 'no existe' });
  guardar(id, req.body);
  res.json({ ok: true, actualizado: (db.prepare('SELECT actualizado FROM procesos WHERE id = ?').get(id) as any).actualizado });
});
app.delete('/api/procesos/:id', (req, res) => {
  db.prepare('DELETE FROM procesos WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/checklist', (_req, res) => res.json(db.prepare('SELECT * FROM checklist').all()));
app.put('/api/checklist/:clave', (req, res) => {
  db.prepare('INSERT INTO checklist (clave, hecho, nota) VALUES (?,?,?) ON CONFLICT(clave) DO UPDATE SET hecho = excluded.hecho, nota = excluded.nota')
    .run(req.params.clave, req.body.hecho ? 1 : 0, req.body.nota ?? '');
  res.json({ ok: true });
});

app.get('/api/export.json', (_req, res) => {
  const ids = db.prepare('SELECT id FROM procesos ORDER BY id').all() as { id: number }[];
  res.setHeader('Content-Disposition', 'attachment; filename="relevamiento.json"');
  res.json({ procesos: ids.map((r) => completo(r.id)), checklist: db.prepare('SELECT * FROM checklist').all() });
});

const vite = await createVite({ root, server: { middlewareMode: true }, appType: 'spa' });
app.use(vite.middlewares);

const port = Number(process.env.PORT ?? 5180);
app.listen(port, '127.0.0.1', () => console.log(`Relevamiento en http://localhost:${port}`));
