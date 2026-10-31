import type { Campo } from './index.js';

/**
 * Contrato de un trámite (módulo). Es lo que se guarda en `modulos.config` (jsonb)
 * y lo que el back usa para decidir si se puede pagar. Ver README, "Cómo funciona".
 */

/** Qué tiene que existir en la base para dejar pagar. */
export type Requisito =
  /** Trámite libre: alcanza con datos completos y válidos. No consulta la base. */
  | { tipo: 'ninguno' }
  /** El dato tiene que figurar en un registro (ej. Registro de Transportistas). */
  | {
      tipo: 'registro';
      /** Nombre del registro; lo resuelve el resolver del módulo. */
      registro: string;
      /** Campo del formulario por el que se busca (ej. 'cuit'). */
      campo: string;
      /** Estados del registro que habilitan el pago. Si falta, alcanza con que exista. */
      estadosHabilitados?: string[];
    }
  /** Hay una deuda pendiente que se busca con uno o más datos (acta, CUIT, ...). */
  | {
      tipo: 'deuda';
      /** Nombre de la fuente de deuda; lo resuelve el resolver del módulo. */
      fuente: string;
      /** Campos del formulario que identifican la deuda. */
      campos: string[];
    }
  /**
   * La persona presenta una solicitud con datos y documentos y los técnicos del área la
   * revisan en su panel. Recién aprobada se habilita el pago. Ver `ConfigSolicitud`.
   */
  | { tipo: 'revision' };

/**
 * Cómo se calcula el monto. Siempre se evalúa en el back.
 * Los números NO van acá: cada `concepto` apunta a una tarifa editable desde el panel
 * (tabla `tarifas`), y se usa la vigente a la fecha del cálculo.
 */
export type CalculoMonto =
  | { tipo: 'fijo'; concepto: string }
  /** importe = base + suma(valor del campo * factor) */
  | { tipo: 'formula'; base: string; porCampo: { campo: string; concepto: string }[] }
  /** El importe depende del tramo en que cae el valor del campo (ej. cantidad de m³). */
  | { tipo: 'escala'; campo: string; concepto: string }
  /** El monto es el de la deuda encontrada. Solo con requisito 'deuda'. */
  | { tipo: 'deuda' }
  /** El importe depende de la opción elegida en un campo (ej. el tipo de certificado). */
  | { tipo: 'segun-opcion'; campo: string; conceptos: Record<string, string> };

export interface Tramo {
  desde: number;
  /** Sin `hasta`, el tramo no tiene tope. */
  hasta?: number;
  importe: number;
}

/** Una versión de una tarifa. Se edita desde el panel; las versiones anteriores se conservan. */
export interface Tarifa {
  id: string;
  modulo_slug: string;
  /** Código del concepto al que apunta `CalculoMonto` (ej. 'tasa-base'). */
  concepto: string;
  /** Importe (fijo/fórmula) o tramos (escala). */
  valor: number | Tramo[];
  /** Desde cuándo rige (ISO). Rige la última con `vigente_desde` <= fecha del cálculo. */
  vigente_desde: string;
  creado_por: string;
}

/** Qué versión de cada tarifa se usó. Se guarda en la `orden_pago` para que un cambio posterior no la altere. */
export interface TarifaAplicada {
  concepto: string;
  tarifaId: string;
}

export interface ConfigModulo {
  campos: Campo[];
  requisito: Requisito;
  monto: CalculoMonto;
}

/** Datos mínimos que devuelve una consulta, antes de pagar. Nunca domicilio, teléfono, etc. */
export interface DatosMinimos {
  /** Razón social o nombre, para que la persona confirme que es ella. */
  titular?: string;
  /** Estado en el registro (ej. 'activo'). */
  estado?: string;
  /** Detalle de la deuda a mostrar (ej. "Acta AP-2025-0001"). */
  concepto?: string;
}

export type MotivoRechazo =
  | 'datos_invalidos' // faltan campos o el formato no es válido
  | 'no_registrado' // no figura en el registro
  | 'no_habilitado' // figura pero con un estado que no habilita (baja, suspendido)
  | 'sin_deuda' // no hay deuda pendiente
  | 'captcha_invalido' // falta el CAPTCHA o no pasó la verificación
  | 'limite_consultas'; // anti-abuso

/** POST /api/modulos/:slug/validar */
export interface ValidarRequest {
  datos: Record<string, string>;
  /** Token del CAPTCHA. Obligatorio en todos los trámites, también los libres. */
  captcha: string;
}

export type ValidarResponse =
  | {
      ok: true;
      /** Monto calculado por el back, en CENTAVOS (como las tarifas). */
      monto: number;
      /** Versiones de tarifa usadas; se guardan en la orden. Vacío si el monto viene de la deuda. */
      tarifas: TarifaAplicada[];
      datosMinimos?: DatosMinimos;
      /** Se manda de vuelta al crear la orden; el back igual revalida todo. */
      validacionId: string;
    }
  | {
      ok: false;
      motivo: MotivoRechazo;
      /** Mensaje para mostrar a la persona, con qué hacer. */
      mensaje: string;
      /** Errores por campo cuando el motivo es 'datos_invalidos'. */
      errores?: Record<string, string>;
    };

/** Contrato que implementa el resolver de un módulo 'registro' o 'deuda'. */
export interface Resolver {
  consultar(datos: Record<string, string>): Promise<ResultadoConsulta>;
}

export type ResultadoConsulta =
  | { encontrado: true; datosMinimos: DatosMinimos; /** Solo para 'deuda'. */ monto?: number }
  | { encontrado: false; motivo: Extract<MotivoRechazo, 'no_registrado' | 'no_habilitado' | 'sin_deuda'> };

/** Conceptos de tarifa que necesita un cálculo de monto. El panel los usa para pedir sus valores. */
export function conceptosDeMonto(monto: CalculoMonto | undefined): string[] {
  if (!monto) return [];
  switch (monto.tipo) {
    case 'fijo':
    case 'escala':
      return [monto.concepto];
    case 'formula':
      return [monto.base, ...monto.porCampo.map((p) => p.concepto)];
    case 'segun-opcion':
      return [...new Set(Object.values(monto.conceptos))];
    case 'deuda':
      return [];
  }
}
