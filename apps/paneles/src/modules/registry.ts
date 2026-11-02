import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Sprout, TreePine, UserCheck, type LucideIcon } from 'lucide-react';

/**
 * Panel de cada módulo. La API decide quién entra a cuál (config.panel del módulo y los
 * permisos de Ecodatos); acá solo se registra qué componente dibuja cada uno y cómo se ve su
 * tarjeta en el inicio. Cada panel maneja sus propias subrutas bajo `/<slug>/*`.
 */
export interface DefinicionPanel {
  componente: LazyExoticComponent<ComponentType>;
  icono: LucideIcon;
  /** Qué se hace en el panel, para la tarjeta del inicio. */
  descripcion: string;
}

export const paneles: Record<string, DefinicionPanel> = {
  fitosanitarios: {
    componente: lazy(() => import('./fitosanitarios')),
    icono: Sprout,
    descripcion: 'Revisión de solicitudes de certificados: aprobar, observar o rechazar.',
  },
  consultores: {
    componente: lazy(() => import('./consultores')),
    icono: UserCheck,
    descripcion: 'Revisión de inscripciones al registro de consultores: aprobar, observar o rechazar.',
  },
  reservas: {
    componente: lazy(() => import('./reservas')),
    icono: TreePine,
    descripcion: 'Revisión de inscripciones al registro de reservas privadas: aprobar, observar o rechazar.',
  },
};
