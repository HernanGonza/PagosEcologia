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
}
export * from './contrato.js';
export * from './admin.js';
export * from './fitosanitarios/index.js';
export * from './paneles.js';
