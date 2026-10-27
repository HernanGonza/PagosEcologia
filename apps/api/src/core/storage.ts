/**
 * Supabase Storage de Ecodatos, por su API REST con la clave de servicio (sin SDK), como
 * mapa-pronostico. Los buckets de la botonera son privados: los archivos se suben y se leen
 * solo desde la API, y a los técnicos se les dan enlaces firmados que duran minutos.
 *
 *   SUPABASE_URL               dirección pública (la de los enlaces firmados que abre el navegador)
 *   SUPABASE_INTERNAL_URL      opcional: por dónde la API le habla a Supabase dentro de la red
 *   SUPABASE_SERVICE_ROLE_KEY  clave de servicio; solo en el .env de la API, nunca en un front
 */

const env = (k: string) => (process.env[k] ?? '').trim().replace(/\/+$/, '');
const base = () => env('SUPABASE_URL');
const baseInterna = () => env('SUPABASE_INTERNAL_URL') || base();
const clave = () => (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

export class ErrorStorage extends Error {}

export const storageConfigurado = () => !!(base() && clave());

function encabezados(extra: Record<string, string> = {}) {
  if (!storageConfigurado()) throw new ErrorStorage('Storage no está configurado: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  return { Authorization: `Bearer ${clave()}`, apikey: clave(), ...extra };
}

/** Cada segmento de la ruta se codifica; las barras separan carpetas. */
const rutaCodificada = (ruta: string) => ruta.split('/').map(encodeURIComponent).join('/');

export async function subirArchivo(bucket: string, ruta: string, contenido: Buffer, tipoMime: string): Promise<void> {
  const res = await fetch(`${baseInterna()}/storage/v1/object/${encodeURIComponent(bucket)}/${rutaCodificada(ruta)}`, {
    method: 'POST',
    headers: encabezados({ 'Content-Type': tipoMime }),
    body: new Uint8Array(contenido),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new ErrorStorage(`Storage respondió ${res.status} al subir: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

/** Enlace firmado para ver un archivo durante `segundos`. */
export async function enlaceFirmado(bucket: string, ruta: string, segundos = 600): Promise<string> {
  const res = await fetch(`${baseInterna()}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${rutaCodificada(ruta)}`, {
    method: 'POST',
    headers: encabezados({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: segundos }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { signedURL?: string };
  if (!res.ok || !json.signedURL) throw new ErrorStorage(`Storage respondió ${res.status} al firmar el enlace.`);
  // signedURL viene relativo a /storage/v1 (ej. "/object/sign/bucket/ruta?token=…").
  return `${base()}/storage/v1${json.signedURL}`;
}

/** Descarga un archivo (para que la persona vea lo que subió, a través de la API). */
export async function descargarArchivo(bucket: string, ruta: string): Promise<Response> {
  const res = await fetch(`${baseInterna()}/storage/v1/object/${encodeURIComponent(bucket)}/${rutaCodificada(ruta)}`, {
    headers: encabezados(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new ErrorStorage(`Storage respondió ${res.status} al descargar.`);
  return res;
}

/** Tipo real del archivo según sus primeros bytes; no se confía en lo que declara el navegador. */
export function tipoPorContenido(contenido: Buffer): string | null {
  if (contenido.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (contenido[0] === 0xff && contenido[1] === 0xd8 && contenido[2] === 0xff) return 'image/jpeg';
  if (contenido.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}
