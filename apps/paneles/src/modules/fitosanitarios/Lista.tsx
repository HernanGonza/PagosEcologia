import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MessageSquareWarning, Search, Users } from 'lucide-react';
import type { EstadoSolicitud, SolicitudesPanelResponse } from '@botonera/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ContinuousTabs } from '@/components/watermelon/continuous-tabs';
import { api } from '../../sesion';
import { EstadoBadge, RUTA, fecha, hace } from './comunes';

const POR_PAGINA = 50;

const pestanas: { id: string; label: string; estado?: EstadoSolicitud }[] = [
  { id: 'enviada', label: 'Pendientes', estado: 'enviada' },
  { id: 'en_revision', label: 'En revisión', estado: 'en_revision' },
  { id: 'observada', label: 'Observadas', estado: 'observada' },
  { id: 'aprobada', label: 'Aprobadas', estado: 'aprobada' },
  { id: 'rechazada', label: 'Rechazadas', estado: 'rechazada' },
  { id: 'todas', label: 'Todas' },
];

export default function Lista() {
  const [params, setParams] = useSearchParams();
  const pestana = params.get('estado') ?? 'enviada';
  // Dos listas con el mismo flujo de revisión: las altas (primera vez) y las renovaciones.
  const clase = params.get('clase') === 'renovacion' ? 'renovacion' : 'alta';
  const q = params.get('q') ?? '';
  const pagina = Math.max(Number(params.get('pagina')) || 1, 1);
  const [busqueda, setBusqueda] = useState(q);
  const [datos, setDatos] = useState<SolicitudesPanelResponse | null>(null);
  const [error, setError] = useState('');

  const cambiar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) (v ? p.set(k, v) : p.delete(k));
    setParams(p, { replace: true });
  };

  // La búsqueda se aplica cuando se deja de escribir.
  useEffect(() => {
    if (busqueda.trim() === q) return;
    const t = setTimeout(() => cambiar({ q: busqueda.trim() || null, pagina: null }), 350);
    return () => clearTimeout(t);
  }, [busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vigente = true;
    const filtro = new URLSearchParams({ limite: String(POR_PAGINA), desde_fila: String((pagina - 1) * POR_PAGINA), clase });
    const estado = pestanas.find((p) => p.id === pestana)?.estado;
    if (estado) filtro.set('estado', estado);
    if (q) filtro.set('q', q);
    api<SolicitudesPanelResponse>(`${RUTA}/solicitudes?${filtro}`)
      .then((r) => vigente && (setDatos(r), setError('')))
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [pestana, q, pagina, clase]);

  const conteo = (p: (typeof pestanas)[number]) => {
    if (!datos) return undefined;
    if (!p.estado) return Object.values(datos.porEstado).reduce((a, b) => a + (b ?? 0), 0);
    return datos.porEstado[p.estado] ?? 0;
  };
  const paginas = datos ? Math.max(Math.ceil(datos.total / POR_PAGINA), 1) : 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold tracking-[0.1em] text-rosa-600 uppercase">Fitosanitarios</span>
          <h1 className="text-2xl font-medium text-verde-800">{clase === 'renovacion' ? 'Renovaciones de certificado' : 'Solicitudes de certificado'}</h1>
        </div>
        <Button asChild variant="outline" className="rounded-lg">
          <Link to="titulares"><Users /> Titulares y certificados</Link>
        </Button>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Número, titular, CUIT o mail"
            aria-label="Buscar solicitudes"
            className="h-10 bg-white pl-9"
          />
        </div>
      </div>

      <div className="mb-3 inline-flex rounded-lg border border-border bg-white p-0.5 text-sm" role="tablist" aria-label="Tipo de solicitud">
        {([['alta', 'Primera vez'], ['renovacion', 'Renovaciones']] as const).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={clase === id}
            onClick={() => cambiar({ clase: id === 'alta' ? null : id, estado: null, pagina: null })}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${clase === id ? 'bg-verde-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {texto}
          </button>
        ))}
      </div>

      <div className="mb-4 overflow-x-auto pb-1">
        <ContinuousTabs
          key={`${clase}-${datos ? 'con-conteo' : 'sin-conteo'}`}
          size="sm"
          defaultActiveId={pestana}
          onChange={(id) => cambiar({ estado: id === 'enviada' ? null : id, pagina: null })}
          tabs={pestanas.map((p) => {
            const n = conteo(p);
            return { id: p.id, label: n === undefined ? p.label : `${p.label} · ${n}` };
          })}
        />
      </div>

      {error && <p className="rounded-xl bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {!datos ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : !datos.filas.length ? (
          <p className="px-6 py-14 text-center text-muted-foreground">
            {q ? 'No hay solicitudes que coincidan con la búsqueda.' : pestana === 'enviada' ? 'No hay solicitudes esperando revisión.' : 'No hay solicitudes en este estado.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {datos.filas.map((f) => (
              <li key={f.id}>
                <Link to={f.id} className="grid gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-crema/60 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:px-6">
                  <div className="flex items-center gap-2 sm:block">
                    <div className="text-sm font-medium tabular-nums">{f.numero}</div>
                    <div className="text-xs text-muted-foreground">{f.tipoNombre}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{f.titular ?? f.email}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {[f.identificador, f.titular ? f.email : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:text-right">
                    {f.observacionesAbiertas > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-rosa-600" title="Observaciones sin resolver">
                        <MessageSquareWarning className="size-3.5" /> {f.observacionesAbiertas}
                      </span>
                    )}
                    <EstadoBadge estado={f.estado} />
                    <span className="text-xs text-muted-foreground sm:w-32" title={`Enviada el ${fecha(f.enviadaEn)}`}>
                      {f.estado === 'enviada'
                        ? hace(f.enviadaEn)
                        : f.estado === 'en_revision' && f.revisorNombre
                          ? `${f.revisorNombre}, ${hace(f.tomadaEn)}`
                          : f.revisorNombre ?? fecha(f.enviadaEn)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {datos && paginas > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          Página {pagina} de {paginas}
          <Button variant="outline" size="icon" disabled={pagina <= 1} onClick={() => cambiar({ pagina: String(pagina - 1) })} aria-label="Anterior">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" disabled={pagina >= paginas} onClick={() => cambiar({ pagina: String(pagina + 1) })} aria-label="Siguiente">
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
