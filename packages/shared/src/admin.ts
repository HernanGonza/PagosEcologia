/**
 * Contrato entre el panel de Recaudaciones (apps/admin) y la API (/api/admin).
 * Los importes viajan en centavos; el front los formatea.
 */

export const periodosAdmin = ['hoy', '7d', '30d', 'anio'] as const;
export type PeriodoAdmin = (typeof periodosAdmin)[number];

export type EstadoOrden = 'pendiente' | 'pagada' | 'rechazada' | 'vencida' | 'anulada';

/** GET /api/admin/resumen?periodo= */
export interface ResumenAdmin {
  periodo: PeriodoAdmin;
  /** Rango consultado, fechas ISO (YYYY-MM-DD) en hora de Argentina. */
  desde: string;
  hasta: string;
  recaudadoCentavos: number;
  /** Mismo indicador en el período anterior de igual duración. */
  recaudadoAnteriorCentavos: number;
  pagosConfirmados: number;
  ticketPromedioCentavos: number;
  ordenesPendientes: number;
  ordenesRechazadas: number;
  /** Recaudación por día (o por mes si el período es el año). */
  serie: { fecha: string; recaudadoCentavos: number; pagos: number }[];
  porTramite: { slug: string; nombre: string; recaudadoCentavos: number; pagos: number }[];
  ultimosPagos: OrdenAdmin[];
}

export interface OrdenAdmin {
  id: number;
  moduloSlug: string;
  moduloNombre: string;
  identificador: string | null;
  importeCentavos: number;
  estado: EstadoOrden;
  creadaEn: string;
  pagadaEn: string | null;
  proveedor: string | null;
  referenciaExterna: string | null;
  comprobante: string | null;
}

/** GET /api/admin/ordenes */
export interface OrdenesAdminResponse {
  total: number;
  filas: OrdenAdmin[];
}

export interface TarifaVersionAdmin {
  /** Importe en centavos o tramos; ver `Tarifa` en contrato.ts. */
  valor: unknown;
  vigenteDesde: string;
  creadoPor: string;
}

/** GET /api/admin/tramites. Todo sale de pagos.modulos: un módulo nuevo aparece solo. */
export interface TramiteAdmin {
  slug: string;
  nombre: string;
  categoria: string;
  tipo: string;
  activo: boolean;
  /** Qué tiene que existir para dejar pagar (de `config.requisito`). */
  requisito: 'ninguno' | 'registro' | 'deuda' | 'revision' | 'sin_configurar';
  /** Datos que pide el trámite (de `config.campos`). */
  campos: string[];
  conceptos: {
    concepto: string;
    /** Lo pide `config.monto`. Si es false, es una tarifa cargada que el cálculo ya no usa. */
    requerido: boolean;
    vigente: TarifaVersionAdmin | null;
    /** Versión cargada con fecha futura, si la hay. */
    proxima: TarifaVersionAdmin | null;
    historial: TarifaVersionAdmin[];
  }[];
}

/** GET /api/admin/auditoria */
export interface AuditoriaAdmin {
  id: number;
  actor: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  creadaEn: string;
}

/** Roles del panel (ver README, "Roles"). */
export type RolAdmin = 'administrador' | 'recaudaciones' | 'area' | 'auditor';

export interface UsuarioAdmin {
  nombre: string;
  email: string;
  rol: RolAdmin;
  /** Módulos que puede ver/editar el rol 'area'. Vacío = todos. */
  modulos: string[];
}
