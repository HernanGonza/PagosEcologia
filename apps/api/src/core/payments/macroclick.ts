/**
 * Click de Pago (Macro) — modalidad FORMULARIO (la única que el banco habilitó).
 *
 * Cada trámite cobra en una cuenta distinta: las credenciales viven en el .env como PAGOS_<CUENTA>_*.
 * El navegador del contribuyente hace el POST al checkout del banco con los campos cifrados (AES-256-CBC con la
 * secret key) y un Hash SHA-256 (ip*comercio*sucursal*monto*secretKey), igual que la librería oficial PlusPagos.
 *
 * SEGURIDAD (el agujero que tiene el sistema de pesca): el aviso del banco NO trae firma, así que NUNCA se cree
 * el cuerpo. `confirmarPago` vuelve a preguntarle al banco, con las credenciales de la cuenta, el estado y el
 * monto reales de esa transacción; solo si coinciden con lo que esperamos se da por pagada. La URL de retorno
 * del navegador tampoco confirma nada: solo muestra el estado que ya está en la base.
 */
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

export interface CuentaPago {
  nombre: string;
  ambiente: 'sandbox' | 'produccion';
  guid: string;
  frase: string;
  secretKey: string;
  sucursal: string;
  urlPost: string;
  webhookToken: string;
}

const BASE_API = {
  sandbox: 'https://sandboxpp.asjservicios.com.ar:8082/v1',
  produccion: 'https://botonpp.asjservicios.com.ar:8082/v1',
} as const;

/** Estados de Click de Pago (manual §Transacciones). */
export const ESTADO = { CREADA: 1, EN_PAGO: 2, REALIZADA: 3, RECHAZADA: 4, EXPIRADA: 7, CANCELADA: 8, DEVUELTA: 9, PENDIENTE: 10, VENCIDA: 11 } as const;

/** Lee PAGOS_<CUENTA>_* del entorno. Lanza error (sin mostrar valores) si falta algo. */
export function cuentaDesdeEnv(nombre: string, env: NodeJS.ProcessEnv = process.env): CuentaPago {
  const p = `PAGOS_${nombre.toUpperCase()}_`;
  const get = (k: string) => env[p + k]?.trim() ?? '';
  const faltan = ['GUID', 'FRASE', 'SECRET_KEY', 'URL_POST', 'WEBHOOK_TOKEN'].filter((k) => !get(k));
  if (faltan.length) throw new Error(`Pasarela "${nombre}": faltan en el .env ${faltan.map((k) => p + k).join(', ')}`);
  const ambiente = get('AMBIENTE') === 'produccion' ? 'produccion' : 'sandbox';
  if (get('MODALIDAD') && get('MODALIDAD') !== 'formulario') {
    throw new Error(`Pasarela "${nombre}": ${p}MODALIDAD=${get('MODALIDAD')}; el banco solo habilitó "formulario".`);
  }
  return {
    nombre, ambiente, guid: get('GUID'), frase: get('FRASE'), secretKey: get('SECRET_KEY'),
    sucursal: get('SUCURSAL') || '0000000000', urlPost: get('URL_POST'), webhookToken: get('WEBHOOK_TOKEN'),
  };
}

// ── Cifrado y firma (algoritmo de la librería oficial PlusPagos) ─────────────────────────────

/** Clave AES: la secret key repetida/cortada a exactamente 32 caracteres. */
function claveAes(secretKey: string): Buffer {
  let k = secretKey;
  while (k.length < 32) k += k;
  return Buffer.from(k.slice(0, 32), 'utf8');
}

/** AES-256-CBC con IV aleatorio; devuelve base64(iv + cifrado). */
export function cifrar(texto: string, secretKey: string, iv: Buffer = randomBytes(16)): string {
  const c = createCipheriv('aes-256-cbc', claveAes(secretKey), iv);
  return Buffer.concat([iv, c.update(texto, 'utf8'), c.final()]).toString('base64');
}

/** SHA-256 hexadecimal de `ip*comercio*sucursal*monto*secretKey` (monto en centavos, sin cifrar). */
export function firmar(p: { ip: string; comercio: string; sucursal: string; montoCentavos: number; secretKey: string }): string {
  return createHash('sha256').update(`${p.ip}*${p.comercio}*${p.sucursal}*${p.montoCentavos}*${p.secretKey}`, 'utf8').digest('hex');
}

export interface FormularioPago {
  /** Dónde hace el POST el navegador. */
  action: string;
  campos: Record<string, string>;
}

/**
 * Arma el formulario que el navegador del contribuyente envía al banco.
 * `ip` es la del contribuyente tal como la ve nuestro servidor (req.ip con TRUST_PROXY bien puesto):
 * entra en el hash y el banco la compara con la del navegador que hace el POST.
 */
export function construirFormulario(cuenta: CuentaPago, p: {
  transaccionId: string; montoCentavos: number; descripcion: string; urlExito: string; urlCancelar: string; ip: string; informacion?: string;
}): FormularioPago {
  if (!Number.isInteger(p.montoCentavos) || p.montoCentavos <= 0) throw new Error('El monto tiene que ser un entero de centavos mayor a cero.');
  const k = cuenta.secretKey;
  return {
    action: cuenta.urlPost,
    campos: {
      CallbackSuccess: cifrar(p.urlExito, k),
      CallbackCancel: cifrar(p.urlCancelar, k),
      Comercio: cuenta.guid,
      TransaccionComercioId: p.transaccionId,
      Monto: cifrar(String(p.montoCentavos), k),
      Informacion: cifrar(p.informacion ?? p.descripcion, k),
      SucursalComercio: cifrar(cuenta.sucursal, k),
      Hash: firmar({ ip: p.ip, comercio: cuenta.guid, sucursal: cuenta.sucursal, montoCentavos: p.montoCentavos, secretKey: k }),
      'Producto[0]': p.descripcion,
      'MontoProducto[0]': (p.montoCentavos / 100).toFixed(2),
    },
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Página mínima que envía sola el formulario al banco (redirección completa, sin ventana emergente). */
export function paginaAutoEnvio(f: FormularioPago): string {
  const inputs = Object.entries(f.campos).map(([n, v]) => `<input type="hidden" name="${esc(n)}" value="${esc(v)}">`).join('');
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Redirigiendo al pago…</title>` +
    `<body onload="document.forms[0].submit()"><p>Te estamos llevando a la pasarela de pago…</p>` +
    `<form method="post" action="${esc(f.action)}">${inputs}<noscript><button>Continuar al pago</button></noscript></form></body></html>`;
}

// ── Consulta al banco (única fuente de verdad) ───────────────────────────────────────────────

const tokens = new Map<string, { token: string; vence: number }>();

async function api<T>(cuenta: CuentaPago, path: string, init: RequestInit & { sinToken?: boolean } = {}, reintento = true): Promise<T> {
  const base = BASE_API[cuenta.ambiente];
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!init.sinToken) headers.Authorization = `Bearer ${await tokenDe(cuenta)}`;
  const r = await fetch(base + path, { ...init, headers, signal: AbortSignal.timeout(15000) });
  if (r.status === 401 && reintento && !init.sinToken) { tokens.delete(cuenta.nombre); return api<T>(cuenta, path, init, false); }
  const texto = await r.text();
  if (!texto) throw new Error(`Click de Pago respondió vacío (${r.status}) en ${path}`);
  return JSON.parse(texto) as T;
}

async function tokenDe(cuenta: CuentaPago): Promise<string> {
  const c = tokens.get(cuenta.nombre);
  if (c && c.vence > Date.now()) return c.token;
  const r = await api<{ status: boolean; data: string; message?: string }>(
    cuenta, '/sesion', { method: 'POST', body: JSON.stringify({ guid: cuenta.guid, frase: cuenta.frase }), sinToken: true });
  if (!r.status || !r.data) throw new Error(`Click de Pago rechazó las credenciales de "${cuenta.nombre}"`);
  tokens.set(cuenta.nombre, { token: r.data, vence: Date.now() + 3 * 60 * 60 * 1000 }); // el token dura ≈ 4 h
  return r.data;
}

export interface TransaccionBanco {
  estado: 'pagado' | 'rechazado' | 'pendiente';
  estadoId: number;
  montoCentavos: number;
  transaccionId: string;
  bruto: unknown;
}

/** "17507,98" | "100.50" | 100.5 → centavos enteros. */
export function montoACentavos(m: unknown): number {
  const s = String(m ?? '').trim().replace(/\s/g, '');
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normal);
  if (!Number.isFinite(n)) throw new Error('Monto ilegible en la respuesta del banco');
  return Math.round(n * 100);
}

/** Pregunta al banco el estado real de una transacción. Devuelve null si el banco no la conoce. */
export async function consultarTransaccion(cuenta: CuentaPago, transaccionId: string): Promise<TransaccionBanco | null> {
  const r = await api<{ status: boolean; code?: number; data?: { estadoId: number; monto: unknown; transaccionComercioId: string } }>(
    cuenta, `/transaction/${encodeURIComponent(transaccionId)}`);
  if (!r.status || !r.data) return null;
  const id = r.data.estadoId;
  const estado = id === ESTADO.REALIZADA ? 'pagado' : [ESTADO.RECHAZADA, ESTADO.EXPIRADA, ESTADO.CANCELADA, ESTADO.VENCIDA].includes(id as never) ? 'rechazado' : 'pendiente';
  return { estado, estadoId: id, montoCentavos: montoACentavos(r.data.monto), transaccionId: r.data.transaccionComercioId, bruto: r.data };
}

/**
 * Confirmación de un pago. Ignora lo que diga el aviso: consulta al banco y exige que la transacción exista,
 * esté REALIZADA y que el monto sea EXACTAMENTE el de nuestra orden. Cualquier otra cosa → no se marca pagada.
 */
export async function confirmarPago(cuenta: CuentaPago, esperado: { transaccionId: string; montoCentavos: number }):
  Promise<{ pagado: boolean; estado: TransaccionBanco['estado'] | 'desconocido'; motivo?: string }> {
  const t = await consultarTransaccion(cuenta, esperado.transaccionId);
  if (!t) return { pagado: false, estado: 'desconocido', motivo: 'El banco no conoce esa transacción' };
  if (t.transaccionId !== esperado.transaccionId) return { pagado: false, estado: t.estado, motivo: 'El banco devolvió otra transacción' };
  if (t.estado !== 'pagado') return { pagado: false, estado: t.estado };
  if (t.montoCentavos !== esperado.montoCentavos) {
    return { pagado: false, estado: t.estado, motivo: `Monto distinto: el banco cobró ${t.montoCentavos} y la orden era ${esperado.montoCentavos}` };
  }
  return { pagado: true, estado: 'pagado' };
}

