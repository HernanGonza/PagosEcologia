/**
 * Cantidad de solicitudes nuevas (sin tomar) de cada panel: el numerito de las tarjetas del
 * inicio y del menú. Se actualiza cada minuto, al volver a la pestaña y después de cada acción.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PendientesPanel } from '@botonera/shared';
import { api } from './sesion';

const CADA_MS = 60_000;

const Contexto = createContext<{ pendientes: PendientesPanel; refrescar: () => void }>({ pendientes: {}, refrescar: () => {} });

export function PendientesProvider({ children }: { children: ReactNode }) {
  const [pendientes, setPendientes] = useState<PendientesPanel>({});

  const refrescar = useCallback(() => {
    api<PendientesPanel>('/paneles/pendientes')
      .then(setPendientes)
      .catch(() => {}); // si falla, queda el último valor: no es motivo para cortar el panel
  }, []);

  useEffect(() => {
    refrescar();
    const intervalo = setInterval(() => document.visibilityState === 'visible' && refrescar(), CADA_MS);
    const alVolver = () => document.visibilityState === 'visible' && refrescar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [refrescar]);

  return <Contexto.Provider value={{ pendientes, refrescar }}>{children}</Contexto.Provider>;
}

export const usePendientes = () => useContext(Contexto);

/** El numerito. No se muestra en cero. */
export function BadgePendientes({ n, className = '' }: { n: number | undefined; className?: string }) {
  if (!n) return null;
  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-rosa-600 px-1.5 text-xs leading-5 font-semibold text-white tabular-nums ${className}`}
      aria-label={`${n} ${n === 1 ? 'solicitud nueva' : 'solicitudes nuevas'}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}
