/**
 * Titulares, objetos registrados y certificados (README-titulares-y-certificados.md).
 * El registro vive en Ecodatos; las definiciones de estado están en SQL (`fito_estado_*`) y acá
 * solo se nombran los valores que devuelve.
 */

export type EstadoCertificado = 'vigente' | 'por_comenzar' | 'vencido' | 'revocado';
export type EstadoObjeto = 'vigente' | 'vencido' | 'revocado' | 'sin_certificado';

/** Reglas de renovación (`modulos.config.renovacion`). */
export interface ConfigRenovacion {
  /** Se puede renovar desde tantos días antes del vencimiento. */
  anticipacionDias: number;
  /** ...y hasta tantos días después. Pasado ese plazo se empieza de nuevo (alta). */
  graciaDias: number;
  validezMeses: number;
  avisosDias: number[];
}

export const renovacionPorDefecto: ConfigRenovacion = { anticipacionDias: 30, graciaDias: 30, validezMeses: 12, avisosDias: [30, 7] };

/** Un certificado emitido, tal como se muestra (historial). */
export interface CertificadoVista {
  id: string;
  numero: string;
  vigenteDesde: string;
  venceEn: string;
  emitidoEn: string;
  estado: EstadoCertificado;
  diasParaVencer: number;
  renovadoDe: string | null;
  codigoVerificacion: string;
  revocadoEn: string | null;
  revocadoMotivo: string | null;
}

/** Un objeto registrado (vehículo, local, depósito…) con su estado actual. */
export interface ObjetoVista {
  id: string;
  nroRegistro: number | null;
  tipoNombre: string | null;
  /** Patente de un vehículo, dirección de un local… */
  etiqueta: string | null;
  fechaRegistro: string;
  venceEn: string | null;
  estado: EstadoObjeto;
  diasParaVencer: number | null;
  vtvVenceEn: string | null;
  vtvVencida: boolean;
  /** Certificado actual: el último de la cadena de renovaciones, si no fue revocado. */
  certificadoActualId: string | null;
  /** Se puede renovar hoy (dentro de la ventana y sin renovación en curso). */
  puedeRenovar: boolean;
  /** Por qué no (si no se puede). */
  motivoNoRenovar: string | null;
  renovacionEnCurso: string | null;
  certificados: CertificadoVista[];
}

export interface VinculoVista {
  id: number;
  email: string;
  aprobadoEn: string;
  aprobadoPor: string | null;
  bajaSolicitadaEn: string | null;
  bajaSolicitadaPor: string | null;
  bajaEn: string | null;
  bajaPor: string | null;
  bajaMotivo: string | null;
}

export interface TitularResumen {
  id: string;
  tipoPersona: 'fisica' | 'juridica';
  dni: string | null;
  cuit: string | null;
  nombre: string;
  objetos: number;
  vigentes: number;
  proximoVencimiento: string | null;
}

export interface TitularFicha extends Omit<TitularResumen, 'objetos' | 'vigentes' | 'proximoVencimiento'> {
  telefono: string | null;
  domicilio: string | null;
  creadoEn: string;
  objetos: ObjetoVista[];
  vinculos: VinculoVista[];
  solicitudes: { id: string; numero: string; tipo: string; tipoSolicitud: 'alta' | 'renovacion'; estado: string; enviadaEn: string | null }[];
}

export interface TitularesResponse {
  filas: TitularResumen[];
}

/** Lo que ve el tablero de la persona: los titulares de los que es representante. */
export interface MisTitularesResponse {
  email: string;
  titulares: (Omit<TitularFicha, 'vinculos' | 'solicitudes'> & {
    misSolicitudes: TitularFicha['solicitudes'];
    /** Los otros representantes, con el mail parcialmente oculto. */
    representantes: { id: number; email: string; soyYo: boolean; bajaSolicitada: boolean }[];
  })[];
  /** Solicitudes de ese mail todavía sin titular (aún sin aprobar). */
  solicitudesSinTitular: TitularFicha['solicitudes'];
}

/** GET /api/fitosanitarios/verificar/:codigo — datos mínimos y públicos. */
export interface VerificacionPublica {
  numero: string;
  estado: EstadoCertificado;
  tipoNombre: string | null;
  etiqueta: string | null;
  vigenteDesde: string;
  venceEn: string;
  titular: string;
  /** Solo vehículos. */
  vtvVenceEn: string | null;
}

export interface RenovacionResponse {
  /** Solicitudes de renovación creadas (una por certificado). */
  solicitudes: { numero: string; certificadoId: string; estado: string; requiereRevision: boolean }[];
}
