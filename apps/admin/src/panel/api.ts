import { useEffect, useState } from 'react';
import type { EstadoOrden } from '@botonera/shared';

/** GET a la API del panel (/api/admin/...). Vite la proxea a la API en desarrollo. */
export function useApi<T>(ruta: string) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    setError(null);
    fetch(`/api/admin${ruta}`, { signal: control.signal })
      .then(async (res) => {
        const cuerpo = await res.json().catch(() => null);
        if (!res.ok) throw new Error(cuerpo?.error ?? `Error ${res.status}`);
        setDatos(cuerpo as T);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message || 'No se pudo conectar con la API.');
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [ruta]);

  return { datos, error, cargando };
}

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const pesosCorto = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 });

export const formatoPesos = (centavos: number) => pesos.format(centavos / 100);
export const formatoPesosCorto = (centavos: number) => pesosCorto.format(centavos / 100);

export const formatoFechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

/** "2026-10-27" → "27/10" (o "oct" si es un mes). */
export function etiquetaFecha(fecha: string, porMes: boolean) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return porMes
    ? d.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
    : `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

export const estadosOrden: Record<EstadoOrden, { etiqueta: string; color: string }> = {
  pendiente: { etiqueta: 'Pendiente', color: 'var(--chart-3)' },
  pagada: { etiqueta: 'Pagada', color: 'var(--chart-4)' },
  rechazada: { etiqueta: 'Rechazada', color: 'var(--destructive)' },
  vencida: { etiqueta: 'Vencida', color: 'var(--muted-foreground)' },
  anulada: { etiqueta: 'Anulada', color: 'var(--muted-foreground)' },
};
