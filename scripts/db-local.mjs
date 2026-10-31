// Postgres local de pruebas, para trabajar fuera de la red del ministerio.
// Es un cluster propio dentro de .local/ (no toca el Postgres del sistema): se crea la primera vez,
// se enciende si está apagado, y se deja con las migraciones aplicadas y datos de prueba.
//   npm run db:local            prepara y deja corriendo
//   npm run db:local -- stop    lo apaga
//   npm run db:local -- reset   borra todo y lo arma de nuevo
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dirLocal = path.join(raiz, '.local');
const datos = path.join(dirLocal, 'pgdata');
const sockets = path.join(dirLocal, 'run');
export const PUERTO = 54329;
export const BASE = 'botonera_local';
export const URL_API = `postgresql://botonera@127.0.0.1:${PUERTO}/${BASE}`;
const URL_ADMIN = (db) => `postgresql://postgres@127.0.0.1:${PUERTO}/${db}`;

function binarios() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const base = '/usr/lib/postgresql';
  const versiones = existsSync(base) ? readdirSync(base).sort((a, b) => Number(b) - Number(a)) : [];
  const dir = versiones.map((v) => path.join(base, v, 'bin')).find((d) => existsSync(path.join(d, 'initdb')));
  if (!dir) throw new Error('No encuentro los binarios de PostgreSQL (initdb). Instalá postgresql o definí PG_BIN.');
  return dir;
}
const bin = (nombre) => path.join(binarios(), nombre);

const encendido = () => spawnSync(bin('pg_isready'), ['-h', '127.0.0.1', '-p', String(PUERTO)]).status === 0;

function encender() {
  if (!existsSync(path.join(datos, 'PG_VERSION'))) {
    console.log('Creando la base local en .local/pgdata …');
    mkdirSync(dirLocal, { recursive: true });
    execFileSync(bin('initdb'), ['-D', datos, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8'], { stdio: 'ignore' });
  }
  if (encendido()) return;
  mkdirSync(sockets, { recursive: true });
  execFileSync(
    bin('pg_ctl'),
    ['-D', datos, '-l', path.join(dirLocal, 'postgres.log'), '-w', '-o', `-p ${PUERTO} -c listen_addresses=127.0.0.1 -k ${sockets}`, 'start'],
    { stdio: 'ignore' },
  );
}

async function consultar(db, fn) {
  const c = new pg.Client({ connectionString: URL_ADMIN(db) });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function preparar() {
  encender();
  const existe = await consultar('postgres', async (c) => (await c.query('select 1 from pg_database where datname = $1', [BASE])).rowCount);
  if (!existe) await consultar('postgres', (c) => c.query(`create database ${BASE}`));

  await consultar(BASE, async (c) => {
    // El stub de Ecodatos va primero: las migraciones hacen grant/policy sobre esas tablas.
    await c.query(readFileSync(path.join(raiz, 'db/local/ecodatos-stub.sql'), 'utf8'));
  });

  const r = spawnSync('npm', ['run', 'migrate', '-w', '@botonera/api'], {
    cwd: raiz,
    stdio: 'inherit',
    env: { ...process.env, MIGRATIONS_DATABASE_URL: URL_ADMIN(BASE), DATABASE_URL: URL_ADMIN(BASE) },
  });
  if (r.status !== 0) throw new Error('Fallaron las migraciones sobre la base local.');

  await consultar(BASE, async (c) => {
    await sembrarRegistro(c);
  });
}

/** Catálogo de tipos de Ecodatos (el registro arranca vacío: se carga desde los trámites). Solo si falta. */
async function sembrarRegistro(c) {
  if ((await c.query('select 1 from public.tipos_fito_domi limit 1')).rowCount) return;
  await c.query(`insert into public.tipos_fito_domi (nombre) values ('Comercio'), ('Depósito'), ('Vehículo'), ('Fraccionamiento')`);
}

/** Deja la base local lista y devuelve las variables de entorno para apuntar la API ahí. */
export async function asegurarBaseLocal() {
  await preparar();
  return { DATABASE_URL: URL_API, MIGRATIONS_DATABASE_URL: URL_ADMIN(BASE) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const accion = process.argv[2];
  if (accion === 'stop') {
    if (encendido()) execFileSync(bin('pg_ctl'), ['-D', datos, '-m', 'fast', '-w', 'stop'], { stdio: 'inherit' });
  } else {
    if (accion === 'reset') {
      if (encendido()) execFileSync(bin('pg_ctl'), ['-D', datos, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
      rmSync(datos, { recursive: true, force: true });
    }
    await preparar();
    console.log(`Base local lista: ${URL_API}`);
  }
}
