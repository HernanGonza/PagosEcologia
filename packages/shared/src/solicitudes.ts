/**
 * Trámites con revisión técnica (requisito `revision`): la persona presenta una solicitud con
 * datos y documentos, sin cuenta, y los técnicos del área la aprueban, observan o rechazan en
 * su panel. La definición vive en `modulos.config.solicitud`; las reglas de validación están
 * acá para que el front y el back apliquen exactamente las mismas.
 */

export type TipoRequisito = 'texto' | 'numero' | 'fecha' | 'opcion' | 'documento';

export interface RequisitoSolicitud {
  /** Identificador estable: se usa como clave en `datos` y en los documentos. No cambiarla una vez usada. */
  clave: string;
  etiqueta: string;
  tipo: TipoRequisito;
  obligatorio: boolean;
  ayuda?: string;
  /** Solo para `opcion`. */
  opciones?: string[];
  /** Validación extra para `texto`. */
  formato?: 'dni-cuit' | 'email';
}

export interface TipoSolicitud {
  slug: string;
  nombre: string;
  descripcion?: string;
  requisitos: RequisitoSolicitud[];
}

/** `modulos.config.solicitud` */
export interface ConfigSolicitud {
  /** Días que dura una aprobación sin pagar. */
  aprobacionDias: number;
  /** Requisitos que piden todos los tipos (van primero). */
  requisitosComunes: RequisitoSolicitud[];
  tipos: TipoSolicitud[];
}

export const estadosSolicitud = [
  'borrador', 'enviada', 'en_revision', 'observada', 'aprobada', 'pagada', 'emitida', 'rechazada', 'vencida',
] as const;
export type EstadoSolicitud = (typeof estadosSolicitud)[number];

/** Estados en los que la persona puede cargar o corregir. */
export const estadosEditables: EstadoSolicitud[] = ['borrador', 'observada'];

export const etiquetasEstado: Record<EstadoSolicitud, string> = {
  borrador: 'En preparación',
  enviada: 'Enviada, espera revisión',
  en_revision: 'En revisión',
  observada: 'Con observaciones',
  aprobada: 'Aprobada, falta el pago',
  pagada: 'Pagada',
  emitida: 'Certificado emitido',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
};

/** Formatos de documento aceptados y su tamaño máximo. */
export const formatosDocumento: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
};
export const maxBytesDocumento = 10 * 1024 * 1024;

/** Todos los requisitos de un tipo: los comunes y después los propios. */
export function requisitosDeTipo(config: ConfigSolicitud, tipo: TipoSolicitud): RequisitoSolicitud[] {
  return [...config.requisitosComunes, ...tipo.requisitos];
}

/** CUIT/CUIL con dígito verificador. */
export function cuitValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(cuit[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(cuit[10]);
}

/** Error del valor de un requisito de datos (no documento), o null si está bien. Vacío = sin error. */
export function errorDeValor(req: RequisitoSolicitud, valor: string | undefined): string | null {
  const v = (valor ?? '').trim();
  if (!v) return null;
  if (v.length > 500) return 'Es demasiado largo.';
  switch (req.tipo) {
    case 'numero':
      return Number.isFinite(Number(v.replace(',', '.'))) ? null : 'Tiene que ser un número.';
    case 'fecha':
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? null : 'La fecha no es válida.';
    case 'opcion':
      return req.opciones?.includes(v) ? null : 'Elegí una de las opciones.';
    case 'texto':
      if (req.formato === 'dni-cuit') {
        const d = v.replace(/\D/g, '');
        if (d.length === 7 || d.length === 8) return null;
        if (d.length === 11) return cuitValido(d) ? null : 'El CUIT no es válido: revisá los números.';
        return 'Ingresá un DNI (7 u 8 números) o un CUIT (11 números).';
      }
      if (req.formato === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'El mail no es válido.';
      return null;
    default:
      return null;
  }
}

/**
 * Requisitos obligatorios que faltan o tienen errores. Si la lista está vacía, se puede enviar.
 * `documentos` son las claves de requisito que tienen un documento vigente.
 */
export function requisitosPendientes(
  requisitos: RequisitoSolicitud[],
  datos: Record<string, string>,
  documentos: Set<string> | string[],
): string[] {
  const conDocumento = documentos instanceof Set ? documentos : new Set(documentos);
  return requisitos
    .filter((r) => {
      if (r.tipo === 'documento') return r.obligatorio && !conDocumento.has(r.clave);
      const v = (datos[r.clave] ?? '').trim();
      return (r.obligatorio && !v) || errorDeValor(r, v) !== null;
    })
    .map((r) => r.clave);
}

export interface DocumentoSolicitud {
  id: number;
  requisito: string;
  nombre: string;
  tipoMime: string;
  bytes: number;
  subidoEn: string;
}

export interface ObservacionSolicitud {
  id: number;
  /** Null: observación general, no de un requisito. */
  requisito: string | null;
  texto: string;
  autor: string | null;
  creadaEn: string;
  resuelta: boolean;
}

export interface HistorialSolicitud {
  estado: EstadoSolicitud;
  anterior: EstadoSolicitud | null;
  actor: 'solicitante' | 'tecnico' | 'sistema';
  actorNombre: string | null;
  /** Solo en el panel. */
  actorEmail?: string | null;
  nota: string | null;
  fecha: string;
}

/** Tipo de solicitud tal como lo ve la persona: requisitos ya combinados e importe vigente. */
export interface TipoSolicitudPublico {
  slug: string;
  nombre: string;
  descripcion: string | null;
  requisitos: RequisitoSolicitud[];
  /** Null si la tarifa todavía no está cargada. */
  importeCentavos: number | null;
}

/** GET /api/fitosanitarios/solicitudes/:token */
export interface SolicitudPublica {
  numero: string;
  estado: EstadoSolicitud;
  email: string;
  tipo: TipoSolicitudPublico;
  datos: Record<string, string>;
  documentos: DocumentoSolicitud[];
  observaciones: ObservacionSolicitud[];
  historial: HistorialSolicitud[];
  /** Claves de requisitos que faltan o tienen errores. */
  pendientes: string[];
  puedeEditar: boolean;
  enviadaEn: string | null;
  aprobacionVence: string | null;
  motivoRechazo: string | null;
}

/** Fila del listado del panel. */
export interface SolicitudResumenPanel {
  id: string;
  numero: string;
  tipo: string;
  tipoNombre: string;
  estado: EstadoSolicitud;
  titular: string | null;
  identificador: string | null;
  email: string;
  enviadaEn: string | null;
  actualizadaEn: string;
  revisorNombre: string | null;
  tomadaEn: string | null;
  observacionesAbiertas: number;
}

export interface SolicitudesPanelResponse {
  total: number;
  porEstado: Partial<Record<EstadoSolicitud, number>>;
  filas: SolicitudResumenPanel[];
}

/** Detalle en el panel: lo mismo que ve la persona, más la revisión y los enlaces a documentos. */
export interface PersonaRevision {
  nombre: string | null;
  email: string | null;
  fecha: string;
}

export interface SolicitudPanel extends Omit<SolicitudPublica, 'documentos' | 'puedeEditar'> {
  id: string;
  revisorNombre: string | null;
  /** Quién la tomó y quién la aprobó o rechazó, con fecha y hora. El detalle de cada paso está en `historial`. */
  tomada: PersonaRevision | null;
  resuelta: PersonaRevision | null;
  documentos: (DocumentoSolicitud & { url: string; reemplazado: boolean })[];
  /** Qué acciones admite el estado actual (y el permiso del usuario). */
  acciones: ('tomar' | 'aprobar' | 'observar' | 'rechazar')[];
}
