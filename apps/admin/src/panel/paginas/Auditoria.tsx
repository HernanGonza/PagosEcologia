import type { AuditoriaAdmin } from '@botonera/shared';
import { DashboardCard, DetailHeader } from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared';
import { formatoFechaHora, useApi } from '../api';
import { EstadoCarga, Pagina, Vacio } from '../comunes';

export default function Auditoria() {
  const { datos, error, cargando } = useApi<AuditoriaAdmin[]>('/auditoria');

  return (
    <Pagina>
      <DashboardCard className="flex flex-col gap-4">
        <DetailHeader title="Últimos cambios" subtitle="Quién cambió qué y cuándo (últimos 100)" />
        <EstadoCarga cargando={cargando && !datos} error={error} />
        {datos && !datos.length ? (
          <Vacio titulo="Sin movimientos todavía">Cada cambio de tarifa, estado o configuración va a quedar registrado acá.</Vacio>
        ) : null}
        {datos?.length ? (
          <div className="min-w-0">
            <div className="hidden grid-cols-12 rounded-lg border border-border bg-secondary/70 px-4 py-3 text-sm font-medium text-foreground/80 md:grid">
              <div className="col-span-3">Fecha</div>
              <div className="col-span-3">Usuario</div>
              <div className="col-span-3">Acción</div>
              <div className="col-span-3">Sobre</div>
            </div>
            {datos.map((a) => (
              <div key={a.id} className="grid gap-1 border-b border-border px-4 py-3 text-sm last:border-b-0 md:grid-cols-12 md:gap-0">
                <div className="text-muted-foreground md:col-span-3">{formatoFechaHora(a.creadaEn)}</div>
                <div className="md:col-span-3">{a.actor}</div>
                <div className="md:col-span-3">{a.accion}</div>
                <div className="text-muted-foreground md:col-span-3">
                  {a.entidad}
                  {a.entidadId ? ` #${a.entidadId}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </DashboardCard>
    </Pagina>
  );
}
