import type { ReactNode } from 'react';
import type { EstadoOrden, OrdenAdmin } from '@botonera/shared';
import {
  DashboardCard,
  DetailTag,
} from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared';
import { estadosOrden, formatoFechaHora, formatoPesos } from './api';

export function Pagina({ children }: { children: ReactNode }) {
  return <section className="flex min-h-full flex-col gap-4 p-4 pb-8 md:p-8">{children}</section>;
}

export function EstadoCarga({ cargando, error }: { cargando: boolean; error: string | null }) {
  if (error) {
    return (
      <DashboardCard className="border-destructive/40 text-sm">
        <div className="font-medium text-destructive">No se pudieron cargar los datos</div>
        <div className="mt-1 text-muted-foreground">{error}</div>
      </DashboardCard>
    );
  }
  if (cargando) return <div className="p-2 text-sm text-muted-foreground">Cargando…</div>;
  return null;
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <div className="text-sm font-medium">{titulo}</div>
      {children ? <div className="max-w-md text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function EtiquetaEstado({ estado }: { estado: EstadoOrden }) {
  const { etiqueta, color } = estadosOrden[estado];
  return <DetailTag color={color}>{etiqueta}</DetailTag>;
}

/** Tabla de órdenes con el estilo del bloque de Watermelon (grilla en escritorio, tarjetas en celular). */
export function TablaOrdenes({ filas }: { filas: OrdenAdmin[] }) {
  return (
    <>
      <div className="hidden min-w-0 md:block">
        <div className="grid grid-cols-12 items-center gap-2 rounded-lg border border-border bg-secondary/70 px-4 py-3 text-sm font-medium text-foreground/80">
          <div className="col-span-1">Orden</div>
          <div className="col-span-3">Trámite</div>
          <div className="col-span-2">DNI / CUIT</div>
          <div className="col-span-2">Fecha</div>
          <div className="col-span-2 text-right">Importe</div>
          <div className="col-span-2 text-right">Estado</div>
        </div>
        {filas.map((o) => (
          <div key={o.id} className="grid grid-cols-12 items-center gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0">
            <div className="col-span-1 text-muted-foreground">#{o.id}</div>
            <div className="col-span-3 min-w-0">
              <div className="truncate">{o.moduloNombre}</div>
              {o.comprobante ? <div className="truncate text-xs text-muted-foreground">Comp. {o.comprobante}</div> : null}
            </div>
            <div className="col-span-2 tabular-nums">{o.identificador ?? '—'}</div>
            <div className="col-span-2 text-muted-foreground">{formatoFechaHora(o.pagadaEn ?? o.creadaEn)}</div>
            <div className="col-span-2 text-right font-medium tabular-nums">{formatoPesos(o.importeCentavos)}</div>
            <div className="col-span-2 flex justify-end">
              <EtiquetaEstado estado={o.estado} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:hidden">
        {filas.map((o) => (
          <div key={o.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{o.moduloNombre}</div>
                <div className="text-xs text-muted-foreground">#{o.id} · {formatoFechaHora(o.pagadaEn ?? o.creadaEn)}</div>
              </div>
              <EtiquetaEstado estado={o.estado} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="tabular-nums text-muted-foreground">{o.identificador ?? '—'}</span>
              <span className="font-medium tabular-nums">{formatoPesos(o.importeCentavos)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
