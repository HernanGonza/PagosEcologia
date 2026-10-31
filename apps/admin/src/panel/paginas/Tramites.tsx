import { useState, type FormEvent } from 'react';
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

const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

/** Cargar una versión nueva del importe: se agrega con su fecha de vigencia, sin tocar las anteriores. */
function CambiarValor({ modulo, concepto, alGuardar }: { modulo: string; concepto: string; alGuardar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [importe, setImporte] = useState('');
  const [desde, setDesde] = useState(hoyLocal());
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="self-start text-xs font-medium text-primary hover:underline sm:self-end">
        Cambiar valor
      </button>
    );
  }
  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const res = await fetch('/api/admin/tarifas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduloSlug: modulo, concepto, importePesos: Number(importe.replace(',', '.')), vigenteDesde: desde }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `Error ${res.status}`);
      setAbierto(false);
      setImporte('');
      alGuardar();
    } catch (err) {
      setError((err as Error).message);
    }
    setGuardando(false);
  }
  return (
    <form onSubmit={guardar} className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:items-end">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Importe ($)
          <input inputMode="decimal" required value={importe} onChange={(e) => setImporte(e.target.value)} className="h-9 w-32 rounded-md border border-input bg-background px-2 text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Rige desde
          <input type="date" required min={hoyLocal()} value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-foreground" />
        </label>
        <button type="submit" disabled={guardando} className="h-9 rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-60">Guardar</button>
        <button type="button" onClick={() => setAbierto(false)} className="h-9 px-2 text-muted-foreground hover:underline">Cancelar</button>
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : <span className="text-xs text-muted-foreground">Queda registrado en la auditoría. No cambia los valores ya cobrados.</span>}
    </form>
  );
}

function Concepto({ c, modulo, alGuardar }: { c: TramiteAdmin['conceptos'][number]; modulo: string; alGuardar: () => void }) {
  const falta = c.requerido && !c.vigente;
  const editable = c.vigente ? typeof c.vigente.valor === 'number' : c.requerido;
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
        {editable ? <CambiarValor modulo={modulo} concepto={c.concepto} alGuardar={alGuardar} /> : null}
      </div>
    </div>
  );
}

export default function Tramites() {
  const [version, setVersion] = useState(0);
  const { datos, error, cargando } = useApi<TramiteAdmin[]>(`/tramites?v=${version}`);

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
                  <Concepto key={c.concepto} c={c} modulo={t.slug} alGuardar={() => setVersion((v) => v + 1)} />
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
