import type { EstadoSolicitud, MisTitularesResponse, RenovacionResponse, SolicitudPublica, TipoSolicitudPublico, VerificacionPublica } from '@botonera/shared';

/** Solicitud en curso de un mail, que se muestra antes de abrir otra. */
export interface SolicitudExistente {
  numero: string;
  tipo: string;
  tipoNombre: string;
  estado: EstadoSolicitud;
  actualizadaEn: string;
}

const BASE = '/api/fitosanitarios';

export class ErrorApi extends Error {
  constructor(public status: number, mensaje: string, public detalle: Record<string, unknown> = {}) {
    super(mensaje);
  }
}

/**
 * Número de la solicitud que se está viendo. Con una sesión de persona (tablero) la cookie no está
 * atada a una solicitud: el número viaja en una cabecera y la API comprueba que sea de ese mail.
 */
let solicitudActual = '';
export const fijarSolicitud = (numero: string) => {
  solicitudActual = /^FITO-\d{4}-\d{6}$/.test(numero) ? numero : '';
};

async function pedir<T>(ruta: string, opciones: RequestInit = {}, { redirigir = true } = {}): Promise<T> {
  let res: Response;
  try {
    // same-origin: la cookie de sesión (HttpOnly) viaja sola; el JavaScript nunca la ve.
    const headers = { ...(solicitudActual && ruta.startsWith('/solicitud') ? { 'X-Solicitud': solicitudActual } : {}), ...(opciones.headers as Record<string, string> | undefined) };
    res = await fetch(BASE + ruta, { credentials: 'same-origin', ...opciones, headers });
  } catch {
    throw new ErrorApi(0, 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.');
  }
  const json = await res.json().catch(() => ({}));
  if (json.codigo === 'enlace_invalido' && redirigir) {
    // La sesión venció o el enlace ya no vale (usado, vencido o reemplazado): a la página donde se pide otro.
    const usado = json.motivo === 'usado' && json.usadoEn;
    window.location.replace(`/pagar/fitosanitarios?enlace=${usado ? `usado&cuando=${encodeURIComponent(json.usadoEn)}` : 'vencido'}`);
    return new Promise<T>(() => {});
  }
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
  pedirCodigo: (email: string, para?: 'recuperar' | 'persona') => pedir<{ ok: true }>('/codigo', json({ email, para })),
  crear: (email: string, codigo: string, tipo: string, nueva = false) =>
    pedir<{ numero: string } | { existentes: SolicitudExistente[] }>('/solicitudes', json({ email, codigo, tipo, nueva })),
  continuar: (email: string, codigo: string, numero: string) => pedir<{ ok: true }>('/continuar', json({ email, codigo, numero })),
  recuperar: (email: string, codigo: string) => pedir<{ ok: true }>('/recuperar', json({ email, codigo })),
  /** Canjea el enlace del mail (un solo uso) por una sesión. */
  abrirSesion: (token: string) => pedir<{ ok: true }>('/sesion', json({ token })),
  solicitud: () => pedir<SolicitudPublica>('/solicitud'),
  guardarDatos: (datos: Record<string, string>) =>
    pedir<SolicitudPublica & { errores: Record<string, string> }>('/solicitud/datos', { ...json({ datos }), method: 'PUT' }),
  subirDocumento: (requisito: string, archivo: File, venceEn?: string) =>
    pedir<SolicitudPublica>(`/solicitud/documentos/${encodeURIComponent(requisito)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': archivo.type || 'application/octet-stream',
        'X-Nombre-Archivo': encodeURIComponent(archivo.name),
        ...(venceEn ? { 'X-Vence-En': venceEn } : {}),
      },
      body: archivo,
    }),
  fijarVencimiento: (requisito: string, venceEn: string) =>
    pedir<SolicitudPublica>(`/solicitud/documentos/${encodeURIComponent(requisito)}/vencimiento`, { ...json({ venceEn }), method: 'PUT' }),
  urlDocumento: (id: number) => `${BASE}/solicitud/documentos/${id}`,
  enviar: () => pedir<SolicitudPublica>('/solicitud/enviar', { method: 'POST' }),
};

// --- Tablero de la persona ("Mis certificados") ---------------------------------------------------
const sinRedirigir = { redirigir: false };
export const persona = {
  entrar: (email: string, codigo: string) => pedir<{ ok: true }>('/persona/entrar', json({ email, codigo }), sinRedirigir),
  salir: () => pedir<{ ok: true }>('/persona/salir', { method: 'POST' }, sinRedirigir),
  misTitulares: () => pedir<MisTitularesResponse>('/persona/mis-titulares', {}, sinRedirigir),
  renovar: (certificados: string[]) => pedir<RenovacionResponse>('/persona/renovar', json({ certificados }), sinRedirigir),
  urlPdf: (certificadoId: string) => `${BASE}/persona/certificados/${certificadoId}/pdf`,
  bajaPropia: (titularId: string) => pedir<{ ok: true }>(`/persona/titulares/${titularId}/baja`, json({}), sinRedirigir),
  pedirBaja: (vinculoId: number) => pedir<{ ok: true }>(`/persona/vinculos/${vinculoId}/pedir-baja`, json({}), sinRedirigir),
};

/** Verificación pública de un certificado (la abre el QR). */
export const verificar = (codigo: string) => pedir<VerificacionPublica>(`/verificar/${encodeURIComponent(codigo)}`, {}, sinRedirigir);

export const pesos = (centavos: number) =>
  (centavos / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
export const fecha = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
