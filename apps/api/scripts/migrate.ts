// Aplica en orden los .sql de db/migrations que todavía no corrieron, cada uno en su transacción.
// Corre como `postgres` (MIGRATIONS_DATABASE_URL); la API usa el rol `botonera` (DATABASE_URL).
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const dir = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
const url = process.env.MIGRATIONS_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Falta MIGRATIONS_DATABASE_URL en el .env');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`create schema if not exists pagos`);
  await client.query(
    `create table if not exists pagos._migraciones (
       archivo    text primary key,
       aplicada_en timestamptz not null default now()
     )`,
  );
  const hechas = new Set(
    (await client.query<{ archivo: string }>('select archivo from pagos._migraciones')).rows.map((r) => r.archivo),
  );
  const archivos = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const pendientes = archivos.filter((f) => !hechas.has(f));
  if (!pendientes.length) console.log('Nada para aplicar.');

  for (const archivo of pendientes) {
    const sql = await readFile(path.join(dir, archivo), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into pagos._migraciones (archivo) values ($1)', [archivo]);
      await client.query('commit');
      console.log(`✔ ${archivo}`);
    } catch (error) {
      await client.query('rollback');
      console.error(`✘ ${archivo}`);
      throw error;
    }
  }
} finally {
  await client.end();
}
