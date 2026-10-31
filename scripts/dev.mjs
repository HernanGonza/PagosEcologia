// Arranca las apps de desarrollo eligiendo solo contra qué base trabajar:
//   - en la red del ministerio (se llega a Ecodatos): usa el .env tal cual, contra Ecodatos;
//   - fuera de la red: levanta el Postgres local de pruebas (scripts/db-local.mjs) y apunta todo ahí,
//     con Storage en disco y sin login (no hay Supabase al que preguntarle).
// Se puede forzar con DB_MODE=local o DB_MODE=ecodatos.
//   npm run dev            api + web + admin + paneles
//   npm run dev:api        solo una (api | web | admin | paneles)
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asegurarBaseLocal } from './db-local.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const TODAS = ['api', 'web', 'admin', 'paneles'];
const pedidas = process.argv.slice(2);
const apps = pedidas.length ? pedidas : TODAS;
for (const a of apps) if (!TODAS.includes(a)) throw new Error(`App desconocida: ${a} (${TODAS.join(' | ')})`);

/** ¿Se llega al Postgres de Ecodatos? Sin respuesta en 2 s, se asume que no hay red. */
function hayEcodatos() {
  const url = process.env.DATABASE_URL || leerEnv('DATABASE_URL');
  const m = /@([^:/]+):?(\d*)/.exec(url ?? '');
  if (!m) return Promise.resolve(false);
  return new Promise((resolve) => {
    const s = net.connect({ host: m[1], port: Number(m[2] || 5432), timeout: 2000 });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('timeout', () => (s.destroy(), resolve(false)));
    s.once('error', () => resolve(false));
  });
}

function leerEnv(clave) {
  try {
    process.loadEnvFile(path.join(raiz, '.env'));
  } catch {
    // sin .env: se prueba con lo que haya en el entorno
  }
  return process.env[clave];
}

const forzado = process.env.DB_MODE;
const local = forzado ? forzado === 'local' : !(await hayEcodatos());
const env = { ...process.env };

if (local) {
  console.log('▶ Sin red del ministerio: usando la base LOCAL de pruebas (npm run db:local -- reset para rearmarla).');
  Object.assign(env, apps.includes('api') ? await asegurarBaseLocal() : {}, {
    // Vacías a propósito: --env-file no pisa lo que ya está definido, y así no se leen las del .env.
    SUPABASE_URL: '',
    SUPABASE_INTERNAL_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    SUPABASE_ANON_KEY: '',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
    STORAGE_LOCAL_DIR: path.join(raiz, '.local/storage'),
    AUTH_LOCAL: 'true',
    VITE_AUTH_LOCAL: 'true',
    ADMIN_SIN_LOGIN: 'true',
    MAIL_PROVIDER: 'consola',
  });
} else {
  console.log('▶ Red del ministerio: usando Ecodatos según el .env.');
}

const hijos = apps.map((app) => {
  const hijo = spawn('npm', ['run', 'dev', '-w', `@botonera/${app}`], { cwd: raiz, env, stdio: 'inherit' });
  hijo.on('exit', (codigo) => {
    if (codigo) console.error(`✘ ${app} terminó con código ${codigo}`);
  });
  return hijo;
});
const cerrar = () => hijos.forEach((h) => h.kill('SIGTERM'));
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
