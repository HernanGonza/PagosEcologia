import { useSyncExternalStore } from 'react';
import type { CatalogoResponse } from '@botonera/shared';

/**
 * Estado público vivo, según la API (/api/modulos): qué módulos están encendidos, el aviso general y el
 * modo mantenimiento (los maneja el equipo técnico desde apps/sistema). Una sola consulta compartida
 * por toda la página, repetida cada 10 s y al volver a la pestaña: los cambios se notan sin recargar.
 */
const REFRESCO_MS = 10_000;

export type EstadoPublico = {
  /** `null` mientras no se pudo consultar: no se esconde nada. */
  activos: Set<string> | null;
  aviso: CatalogoResponse['aviso'];
  mantenimiento: CatalogoResponse['mantenimiento'];
};

let estado: EstadoPublico = { activos: null, aviso: null, mantenimiento: null };
const oyentes = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function actualizar(c: CatalogoResponse) {
  const slugs = c.modulos.map((m) => m.slug);
  const mismos = estado.activos && estado.activos.size === slugs.length && slugs.every((x) => estado.activos!.has(x));
  const siguiente: EstadoPublico = {
    activos: mismos ? estado.activos : new Set(slugs),
    aviso: c.aviso ?? null,
    mantenimiento: c.mantenimiento ?? null,
  };
  // Mismo contenido: se conserva el objeto para no volver a renderizar.
  if (mismos && JSON.stringify([estado.aviso, estado.mantenimiento]) === JSON.stringify([siguiente.aviso, siguiente.mantenimiento])) return;
  estado = siguiente;
  oyentes.forEach((o) => o());
}

function consultar() {
  fetch('/api/modulos')
    .then((r) => (r.ok ? (r.json() as Promise<CatalogoResponse>) : Promise.reject(new Error(String(r.status)))))
    .then(actualizar)
    // Si la API no responde no se esconde nada: cada pantalla ya maneja sus propios errores.
    .catch(() => {});
}

const alVolver = () => document.visibilityState === 'visible' && consultar();

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  if (oyentes.size === 1) {
    consultar();
    timer = setInterval(consultar, REFRESCO_MS);
    document.addEventListener('visibilitychange', alVolver);
  }
  return () => {
    oyentes.delete(oyente);
    if (!oyentes.size) {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alVolver);
    }
  };
}

export function useEstadoPublico(): EstadoPublico {
  return useSyncExternalStore(suscribir, () => estado);
}

/** Slugs de los módulos encendidos (`null` mientras carga). */
export const useModulosActivos = () => useEstadoPublico().activos;
