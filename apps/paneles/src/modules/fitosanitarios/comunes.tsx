import type { EstadoSolicitud } from '@botonera/shared';
import { etiquetasEstado } from '@botonera/shared';
import { cn } from '@/lib/utils';

export const RUTA = '/fitosanitarios/panel';

const tonos: Record<EstadoSolicitud, string> = {
  borrador: 'bg-muted text-muted-foreground',
  enviada: 'bg-sage-200 text-verde-800',
  en_revision: 'bg-aviso/12 text-aviso',
  observada: 'bg-rosa-600/10 text-rosa-600',
  aprobada: 'bg-ok/12 text-ok',
  pagada: 'bg-ok/12 text-ok',
  emitida: 'bg-verde-600 text-white',
  rechazada: 'bg-destructive/10 text-destructive',
  vencida: 'bg-muted text-muted-foreground',
};

/** En el panel, "enviada" es lo que espera a un técnico. */
const etiquetasPanel: Partial<Record<EstadoSolicitud, string>> = {
  enviada: 'Pendiente',
  aprobada: 'Aprobada',
};

export function EstadoBadge({ estado, className }: { estado: EstadoSolicitud; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tonos[estado], className)}>
      {etiquetasPanel[estado] ?? etiquetasEstado[estado]}
    </span>
  );
}

export const fecha = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "hace 3 h", para ver de un vistazo cuánto lleva esperando. */
export function hace(iso: string | null) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}
