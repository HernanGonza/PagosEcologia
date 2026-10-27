import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ResumenAdmin } from '@botonera/shared';
import { Button } from '@/components/ui/button';
import {
  DashboardAnalyticsUpIcon,
  DashboardArrowUpRightIcon,
  DashboardMoneyBagIcon,
  DashboardReloadHorizontalIcon,
  DashboardTaxesIcon,
} from '@/components/watermelon/capitalio-dashboard/components/capitalio/icons';
import {
  DashboardCard,
  DashboardChartTooltip,
  DetailHeader,
  DetailTag,
} from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared';
import { etiquetaFecha, formatoPesos, formatoPesosCorto, useApi } from '../api';
import { EstadoCarga, Pagina, TablaOrdenes, Vacio } from '../comunes';
import { periodos, usePeriodo } from '../PanelLayout';

type Icono = ComponentType<SVGProps<SVGSVGElement>>;

function Indicador({ titulo, valor, icono: Icono, detalle }: { titulo: string; valor: string; icono: Icono; detalle?: React.ReactNode }) {
  return (
    <DashboardCard className="flex min-h-36 flex-col justify-between gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-base leading-6 font-normal">{titulo}</h2>
        <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg p-2 text-white">
          <Icono className="size-5 shrink-0" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
        <div className="text-3xl leading-none font-bold tabular-nums">{valor}</div>
        {detalle ? <div className="pb-0.5 text-xs leading-tight text-muted-foreground">{detalle}</div> : null}
      </div>
    </DashboardCard>
  );
}

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (!anterior) return <span>sin datos del período anterior</span>;
  const pct = ((actual - anterior) / anterior) * 100;
  const color = pct >= 0 ? 'var(--chart-4)' : 'var(--destructive)';
  return (
    <span>
      <span className="font-medium" style={{ color }}>
        {pct >= 0 ? '+' : ''}
        {pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
      </span>{' '}
      vs. período anterior
    </span>
  );
}

function GraficoRecaudacion({ resumen }: { resumen: ResumenAdmin }) {
  const porMes = resumen.periodo === 'anio';
  const datos = resumen.serie.map((p) => ({ name: etiquetaFecha(p.fecha, porMes), recaudado: p.recaudadoCentavos }));
  const etiqueta = periodos.find((p) => p.valor === resumen.periodo)?.etiqueta;

  return (
    <DashboardCard className="flex flex-col gap-6 xl:col-span-2">
      <DetailHeader title="Recaudación" subtitle={porMes ? 'Por mes' : 'Por día'}>
        <DetailTag color="var(--chart-4)">{etiqueta}</DetailTag>
      </DetailHeader>
      <div className="dashboard-dot-grid h-72 min-w-0 overflow-hidden rounded-md">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="recaudacion-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-4)" stopOpacity="0.42" />
                <stop offset="100%" stopColor="var(--chart-4)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <XAxis
              axisLine={false}
              dataKey="name"
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
              minTickGap={16}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
              tickFormatter={(v: number) => formatoPesosCorto(v)}
              width={72}
              allowDecimals={false}
              // Sin pagos el máximo es 0 y todas las marcas dirían "$ 0": se fija un piso.
              domain={[0, (max: number) => Math.max(max, 100_000)]}
            />
            <RechartsTooltip
              cursor={false}
              content={
                <DashboardChartTooltip
                  colors={{ recaudado: 'var(--chart-4)' }}
                  names={{ recaudado: 'Recaudado' }}
                  valueFormatter={(v) => formatoPesos(Number(v))}
                />
              }
            />
            <Area dataKey="recaudado" dot={false} fill="url(#recaudacion-fill)" stroke="var(--chart-4)" strokeWidth={3} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}

function PorTramite({ resumen }: { resumen: ResumenAdmin }) {
  const datos = resumen.porTramite.map((t) => ({ name: t.nombre, recaudado: t.recaudadoCentavos, pagos: t.pagos }));

  return (
    <DashboardCard className="flex flex-col gap-6">
      <DetailHeader title="Por trámite" subtitle={`${resumen.porTramite.length} trámite(s) activo(s)`} />
      {resumen.recaudadoCentavos === 0 ? (
        <Vacio titulo="Sin pagos en el período" />
      ) : (
        <div className="h-48 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" hide />
              <RechartsTooltip
                cursor={false}
                content={<DashboardChartTooltip names={{ recaudado: 'Recaudado' }} valueFormatter={(v) => formatoPesos(Number(v))} />}
              />
              <Bar dataKey="recaudado" fill="var(--chart-1)" radius={4} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="space-y-4">
        {resumen.porTramite.map((t) => (
          <div key={t.slug} className="flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 truncate text-foreground/80">{t.nombre}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium">{formatoPesos(t.recaudadoCentavos)}</span>
              <span className="ml-2 text-muted-foreground">{t.pagos} pagos</span>
            </span>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

export default function Resumen() {
  const periodo = usePeriodo();
  const { datos: resumen, error, cargando } = useApi<ResumenAdmin>(`/resumen?periodo=${periodo}`);

  return (
    <Pagina>
      <EstadoCarga cargando={cargando && !resumen} error={error} />
      {resumen ? (
        <>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Indicador
              titulo="Recaudado"
              valor={formatoPesos(resumen.recaudadoCentavos)}
              icono={DashboardMoneyBagIcon}
              detalle={<Variacion actual={resumen.recaudadoCentavos} anterior={resumen.recaudadoAnteriorCentavos} />}
            />
            <Indicador titulo="Pagos confirmados" valor={String(resumen.pagosConfirmados)} icono={DashboardAnalyticsUpIcon} />
            <Indicador titulo="Ticket promedio" valor={formatoPesos(resumen.ticketPromedioCentavos)} icono={DashboardTaxesIcon} />
            <Indicador
              titulo="Órdenes pendientes"
              valor={String(resumen.ordenesPendientes)}
              icono={DashboardReloadHorizontalIcon}
              detalle={`${resumen.ordenesRechazadas} rechazadas`}
            />
          </div>

          <div className="grid min-w-0 gap-3 xl:grid-cols-3">
            <GraficoRecaudacion resumen={resumen} />
            <PorTramite resumen={resumen} />
          </div>

          <DashboardCard className="flex flex-col gap-4">
            <DetailHeader title="Últimos pagos">
              <Button asChild variant="secondary" size="sm">
                <Link to="/pagos">
                  <span>Ver todos</span>
                  <DashboardArrowUpRightIcon className="size-4 shrink-0" />
                </Link>
              </Button>
            </DetailHeader>
            {resumen.ultimosPagos.length ? (
              <TablaOrdenes filas={resumen.ultimosPagos} />
            ) : (
              <Vacio titulo="Todavía no hay pagos registrados">
                Acá van a aparecer los pagos confirmados por el proveedor (MacroClick).
              </Vacio>
            )}
          </DashboardCard>
        </>
      ) : null}
    </Pagina>
  );
}
