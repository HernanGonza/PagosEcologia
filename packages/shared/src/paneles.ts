/**
 * Paneles de área (apps/paneles): cada módulo que lo necesita tiene el suyo, para que los
 * técnicos del área gestionen sus solicitudes. Se entra con el usuario de Ecodatos.
 */

/**
 * `modulos.config.panel`: quiénes de Ecodatos entran al panel del módulo.
 * Entra quien tenga alguno de esos formularios o áreas asignados, o sea admin de Ecodatos.
 * Con `es_editor = false` en Ecodatos, ve pero no actúa.
 */
export interface ConfigPanel {
  formularios?: string[];
  areas?: string[];
}

export interface UsuarioPanel {
  id: string;
  email: string;
  nombre: string | null;
  esAdmin: boolean;
}

export interface ModuloPanel {
  slug: string;
  nombre: string;
  /** False: solo lectura. */
  puedeEditar: boolean;
}

/** GET /api/paneles/pendientes: solicitudes nuevas (sin tomar) por panel. */
export type PendientesPanel = Record<string, number>;

/** GET /api/paneles/yo */
export interface YoPanel {
  usuario: UsuarioPanel;
  modulos: ModuloPanel[];
}
