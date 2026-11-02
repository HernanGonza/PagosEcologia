// Al arrancar, comprueba que la base tenga todas las migraciones de db/migrations. Sin eso la API
// falla más tarde con errores confusos (ej. "no existe la tabla pagos.fito_enlaces").
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

export async function exigirMigraciones(): Promise<void> {
  const dir = fileURLToPath(new URL('../../../../db/migrations/', import.meta.url));
  let archivos: string[];
  try {
    archivos = (await readdir(dir)).filter((f) => f.endsWith('.sql'));
  } catch {
    return; // despliegue sin la carpeta de migraciones: no hay contra qué comparar
  }
  let hechas: Set<string>;
  try {
    hechas = new Set((await pool.query<{ archivo: string }>('select archivo from pagos._migraciones')).rows.map((r) => r.archivo));
  } catch {
    throw new Error('La base no tiene registro de migraciones (pagos._migraciones). Corré `npm run migrate` antes de levantar la API.');
  }
  const faltan = archivos.filter((f) => !hechas.has(f)).sort();
  if (faltan.length) {
    throw new Error(`Faltan migraciones en esta base: ${faltan.join(', ')}. Corré \`npm run migrate\` (con MIGRATIONS_DATABASE_URL) antes de levantar la API.`);
  }
}

/** Para el panel del sistema: qué migraciones hay en el repo, cuáles están aplicadas en esta base y cuáles faltan. */
export async function estadoMigraciones(): Promise<{ enRepo: number; aplicadas: number; ultima: string | null; faltan: string[] }> {
  const dir = fileURLToPath(new URL('../../../../db/migrations/', import.meta.url));
  const archivos = await readdir(dir).then((f) => f.filter((x) => x.endsWith('.sql')).sort(), () => [] as string[]);
  const { rows } = await pool.query<{ archivo: string }>('select archivo from pagos._migraciones order by archivo');
  const hechas = new Set(rows.map((r) => r.archivo));
  return { enRepo: archivos.length, aplicadas: hechas.size, ultima: rows.at(-1)?.archivo ?? null, faltan: archivos.filter((f) => !hechas.has(f)) };
}
