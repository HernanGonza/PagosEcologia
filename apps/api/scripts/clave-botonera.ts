// Genera una contraseña nueva para el rol `botonera`, la fija en la base y escribe DATABASE_URL
// en el .env (misma conexión que MIGRATIONS_DATABASE_URL, con el usuario botonera.<tenant>).
// Sirve también para rotarla. No imprime la contraseña.
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const base = process.env.MIGRATIONS_DATABASE_URL;
if (!base) throw new Error('Falta MIGRATIONS_DATABASE_URL en el .env');

const clave = randomBytes(24).toString('hex');
const client = new pg.Client({ connectionString: base });
await client.connect();
try {
  await client.query(`alter role botonera password '${clave}'`);
} finally {
  await client.end();
}

const url = new URL(base);
const tenant = decodeURIComponent(url.username).split('.')[1];
url.username = tenant ? `botonera.${tenant}` : 'botonera';
url.password = clave;

const env = await readFile(envPath, 'utf8');
const linea = `DATABASE_URL=${url.toString()}`;
await writeFile(envPath, /^DATABASE_URL=.*$/m.test(env) ? env.replace(/^DATABASE_URL=.*$/m, linea) : `${env}\n${linea}\n`);
console.log('Contraseña de botonera actualizada y DATABASE_URL escrito en .env');
