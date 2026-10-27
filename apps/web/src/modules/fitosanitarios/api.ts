import type { SolicitudPublica, TipoSolicitudPublico } from '@botonera/shared';

const BASE = '/api/fitosanitarios';

export class ErrorApi extends Error {
  constructor(public status: number, mensaje: string, public detalle: Record<string, unknown> = {}) {
    super(mensaje);
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + ruta, opciones);
  } catch {
    throw new ErrorApi(0, 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErrorApi(res.status, json.error ?? 'Ocurrió un error. Intentá de nuevo.', json);
  return json as T;
}

const json = (cuerpo: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

export const api = {
  tipos: () => pedir<TipoSolicitudPublico[]>('/tipos'),
  pedirCodigo: (email: string) => pedir<{ ok: true }>('/codigo', json({ email })),
  crear: (email: string, codigo: string, tipo: string) =>
    pedir<{ token: string; numero: string }>('/solicitudes', json({ email, codigo, tipo })),
  recuperar: (email: string) => pedir<{ ok: true }>('/recuperar', json({ email })),
  solicitud: (token: string) => pedir<SolicitudPublica>(`/solicitudes/${token}`),
  guardarDatos: (token: string, datos: Record<string, string>) =>
    pedir<SolicitudPublica & { errores: Record<string, string> }>(`/solicitudes/${token}/datos`, { ...json({ datos }), method: 'PUT' }),
  subirDocumento: (token: string, requisito: string, archivo: File) =>
    pedir<SolicitudPublica>(`/solicitudes/${token}/documentos/${encodeURIComponent(requisito)}`, {
      method: 'PUT',
      headers: { 'Content-Type': archivo.type || 'application/octet-stream', 'X-Nombre-Archivo': encodeURIComponent(archivo.name) },
      body: archivo,
    }),
  urlDocumento: (token: string, id: number) => `${BASE}/solicitudes/${token}/documentos/${id}`,
  enviar: (token: string) => pedir<SolicitudPublica>(`/solicitudes/${token}/enviar`, { method: 'POST' }),
};

export const pesos = (centavos: number) =>
  (centavos / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
export const fecha = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
