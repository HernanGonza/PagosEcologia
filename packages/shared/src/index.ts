export type TipoModulo = 'simple' | 'consulta' | 'complejo';

export interface Categoria {
  slug: string;
  nombre: string;
  orden: number;
}

export interface Campo {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface Modulo {
  slug: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  categoria_slug: string;
  tipo: TipoModulo;
  orden: number;
  /** Config del formulario (módulos simple/consulta). */
  campos?: Campo[];
  /** Monto fijo de referencia (mock). */
  monto?: number;
}

export interface CatalogoResponse {
  categorias: Categoria[];
  modulos: Modulo[];
  /** Franja informativa en la página pública (la maneja el equipo técnico). */
  aviso: { texto: string; nivel: 'info' | 'alerta' } | null;
  /** Si hay mantenimiento, la página pública no deja operar. */
  mantenimiento: { mensaje: string } | null;
}
export * from './contrato.js';
export * from './admin.js';
export * from './fitosanitarios/index.js';
// Cada módulo expone sus tipos bajo su propio namespace (los nombres se repetirían entre módulos).
export * as consultores from './consultores/index.js';
export * as reservas from './reservas/index.js';
export * from './paneles.js';
