import type { ComponentType, SVGProps } from 'react';
import {
  SidebarAnalyticsIcon,
  SidebarFolderIcon,
  SidebarHomeMutedIcon,
  SidebarLinkIcon,
  SidebarNetWorthIcon,
  SidebarSettingsIcon,
} from '@/components/watermelon/capitalio-dashboard/components/capitalio/icons';

export type ItemNavegacion = {
  nombre: string;
  ruta: string;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
  /** Título de la barra superior si difiere del nombre. */
  titulo?: string;
  /** La pantalla usa el selector de período. */
  conPeriodo?: boolean;
};

export const seccionesNavegacion: { etiqueta: string; items: ItemNavegacion[] }[] = [
  {
    etiqueta: 'General',
    items: [
      { nombre: 'Resumen', ruta: '/', icono: SidebarHomeMutedIcon, titulo: 'Resumen de recaudación', conPeriodo: true },
      { nombre: 'Pagos y órdenes', ruta: '/pagos', icono: SidebarNetWorthIcon },
      { nombre: 'Conciliación', ruta: '/conciliacion', icono: SidebarLinkIcon },
    ],
  },
  {
    etiqueta: 'Gestión',
    items: [
      { nombre: 'Trámites y tarifas', ruta: '/tramites', icono: SidebarSettingsIcon },
      { nombre: 'Reportes', ruta: '/reportes', icono: SidebarAnalyticsIcon },
      { nombre: 'Auditoría', ruta: '/auditoria', icono: SidebarFolderIcon },
    ],
  },
];

const todos = seccionesNavegacion.flatMap((s) => s.items);

export function itemDeRuta(pathname: string) {
  return todos.find((i) => (i.ruta === '/' ? pathname === '/' : pathname.startsWith(i.ruta))) ?? todos[0];
}
