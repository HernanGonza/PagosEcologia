import { useEffect, useState } from 'react';
import type { EstadoOrden, OrdenAdmin, OrdenesAdminResponse, TramiteAdmin } from '@botonera/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TopbarChevronIcon, TopbarExportIcon } from '@/components/watermelon/capitalio-dashboard/components/capitalio/icons';
import { DashboardCard, DetailHeader } from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared';
import { ContinuousTabs } from '@/components/watermelon/continuous-tabs';
import { estadosOrden, useApi } from '../api';
import { EstadoCarga, Pagina, TablaOrdenes, Vacio } from '../comunes';

const POR_PAGINA = 50;

function Filtro<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: T | '';
  opciones: { valor: T; etiqueta: string }[];
  onChange: (v: T | '') => void;
}) {
  const actual = opciones.find((o) => o.valor === valor)?.etiqueta ?? etiqueta;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-9 justify-between gap-2 bg-card font-normal text-muted-foreground">
          <span className="truncate">{actual}</span>
          <TopbarChevronIcon className="h-auto w-3 rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onChange('')}>{etiqueta}</DropdownMenuItem>
        {opciones.map((o) => (
          <DropdownMenuItem key={o.valor} onClick={() => onChange(o.valor)}>
            {o.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function exportarCsv(filas: OrdenAdmin[]) {
  const columnas = ['orden', 'tramite', 'identificador', 'importe', 'estado', 'creada', 'pagada', 'proveedor', 'referencia', 'comprobante'];
  const celdas = filas.map((o) => [
    o.id,
    o.moduloNombre,
    o.identificador ?? '',
    (o.importeCentavos / 100).toFixed(2),
    o.estado,
    o.creadaEn,
    o.pagadaEn ?? '',
    o.proveedor ?? '',
    o.referenciaExterna ?? '',
    o.comprobante ?? '',
  ]);
  const csv = [columnas, ...celdas].map((fila) => fila.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  // BOM para que Excel lea bien los acentos.
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ordenes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Pagos() {
  const [estado, setEstado] = useState<EstadoOrden | ''>('');
  const [modulo, setModulo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(0);

  // Espera a que se deje de tipear para buscar.
  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda), 350);
    return () => clearTimeout(t);
  }, [busqueda]);
  useEffect(() => setPagina(0), [estado, modulo, q, desde, hasta]);

  const params = new URLSearchParams({ limite: String(POR_PAGINA), desde_fila: String(pagina * POR_PAGINA) });
  if (estado) params.set('estado', estado);
  if (modulo) params.set('modulo', modulo);
  if (q.trim()) params.set('q', q.trim());
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);

  const { datos, error, cargando } = useApi<OrdenesAdminResponse>(`/ordenes?${params}`);
  const { datos: tramites } = useApi<TramiteAdmin[]>('/tramites');
  const total = datos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <Pagina>
      <DashboardCard className="flex flex-col gap-4">
        <DetailHeader title="Órdenes de pago" subtitle={datos ? `${total} resultado(s)` : undefined}>
          <Button type="button" size="sm" disabled={!datos?.filas.length} onClick={() => datos && exportarCsv(datos.filas)}>
            <span>Exportar CSV</span>
            <TopbarExportIcon className="size-3 rotate-180" />
          </Button>
        </DetailHeader>

        <ContinuousTabs
          size="sm"
          tabs={[
            { id: '', label: 'Todas' },
            ...Object.entries(estadosOrden).map(([id, e]) => ({ id, label: e.etiqueta })),
          ]}
          defaultActiveId=""
          onChange={(id) => setEstado(id as EstadoOrden | '')}
        />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="DNI/CUIT, nº de orden o comprobante"
            className="h-9"
          />
          <Filtro
            etiqueta="Todos los trámites"
            valor={modulo}
            onChange={setModulo}
            opciones={(tramites ?? []).map((t) => ({ valor: t.slug, etiqueta: t.nombre }))}
          />
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" className="h-9" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" className="h-9" />
        </div>

        <EstadoCarga cargando={cargando && !datos} error={error} />
        {datos && datos.filas.length ? <TablaOrdenes filas={datos.filas} /> : null}
        {datos && !datos.filas.length ? (
          <Vacio titulo="No hay órdenes con estos filtros">
            Las órdenes se crean cuando un contribuyente pasa las validaciones del trámite y va a pagar.
          </Vacio>
        ) : null}

        {total > POR_PAGINA ? (
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <span>
              Página {pagina + 1} de {paginas}
            </span>
            <Button type="button" variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        ) : null}
      </DashboardCard>
    </Pagina>
  );
}
