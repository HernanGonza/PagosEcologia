import type { TarifaVersionAdmin, TramiteAdmin } from '@botonera/shared';
import { DashboardCard, DetailHeader, DetailTag } from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared';
import { formatoPesos, useApi } from '../api';
import { EstadoCarga, Pagina, Vacio } from '../comunes';

const tipos: Record<string, string> = { simple: 'Simple', consulta: 'Con consulta', complejo: 'Complejo' };
const requisitos: Record<TramiteAdmin['requisito'], string> = {
  ninguno: 'Libre',
  registro: 'Tiene que figurar en un registro',
  deuda: 'Tiene que existir una deuda',
  revision: 'Lo aprueban los técnicos del área',
  sin_configurar: 'Sin configurar',
};

function valorTarifa(valor: unknown) {
  if (typeof valor === 'number') return formatoPesos(valor);
  if (Array.isArray(valor)) return `${valor.length} tramos`;
  return String(valor);
}

const fecha = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

function Version({ etiqueta, version }: { etiqueta: string; version: TarifaVersionAdmin }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{etiqueta} </span>
      <span className="font-medium tabular-nums">{valorTarifa(version.valor)}</span>
      <span className="text-muted-foreground"> desde {fecha(version.vigenteDesde)}</span>
    </div>
  );
}

function Concepto({ c }: { c: TramiteAdmin['conceptos'][number] }) {
  const falta = c.requerido && !c.vigente;
  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-medium">{c.concepto}</span>
        {!c.requerido ? <DetailTag color="var(--muted-foreground)">No lo usa el cálculo</DetailTag> : null}
      </div>
      <div className="flex flex-col gap-1 sm:items-end">
        {c.vigente ? <Version etiqueta="Vigente:" version={c.vigente} /> : null}
        {c.proxima ? <Version etiqueta="Próxima:" version={c.proxima} /> : null}
        {falta ? <DetailTag color="var(--destructive)">Sin valor: el trámite no puede cobrar</DetailTag> : null}
        {c.historial.length > 1 ? (
          <span className="text-xs text-muted-foreground">{c.historial.length} versiones cargadas</span>
        ) : null}
      </div>
    </div>
  );
}

export default function Tramites() {
  const { datos, error, cargando } = useApi<TramiteAdmin[]>('/tramites');

  return (
    <Pagina>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {datos && !datos.length ? <Vacio titulo="No hay trámites cargados" /> : null}
      {datos?.map((t) => {
        const faltantes = t.conceptos.filter((c) => c.requerido && !c.vigente).length;
        return (
          <DashboardCard key={t.slug} className="flex flex-col gap-4">
            <DetailHeader title={t.nombre} subtitle={`${t.categoria} · ${tipos[t.tipo] ?? t.tipo}`}>
              {faltantes ? <DetailTag color="var(--destructive)">{faltantes} tarifa(s) sin valor</DetailTag> : null}
              <DetailTag color={t.activo ? 'var(--chart-4)' : 'var(--muted-foreground)'}>{t.activo ? 'Activo' : 'Inactivo'}</DetailTag>
            </DetailHeader>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">Para pagar</div>
                <div>{requisitos[t.requisito]}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Datos que pide</div>
                <div>{t.campos.length ? t.campos.join(', ') : '—'}</div>
              </div>
            </div>

            {t.conceptos.length ? (
              <div className="min-w-0">
                <div className="rounded-lg border border-border bg-secondary/70 px-4 py-3 text-sm font-medium text-foreground/80">
                  Tarifas
                </div>
                {t.conceptos.map((c) => (
                  <Concepto key={c.concepto} c={c} />
                ))}
              </div>
            ) : (
              <Vacio titulo="Este trámite no usa tarifas">El monto sale de la deuda que encuentra el trámite.</Vacio>
            )}
          </DashboardCard>
        );
      })}
    </Pagina>
  );
}
