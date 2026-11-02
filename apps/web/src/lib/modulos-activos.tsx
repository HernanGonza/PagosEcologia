import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import Marco from '../components/Marco';
import { useEstadoPublico } from './estado-publico';

export { useModulosActivos } from './estado-publico';

/** Pantalla de mantenimiento: reemplaza a la página mientras el modo está activo. */
export function Mantenimiento({ mensaje }: { mensaje: string }) {
  return (
    <Marco>
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <Wrench className="mx-auto size-10 text-verde-600" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-medium text-verde-700">Estamos en mantenimiento</h1>
        <p className="mt-3 text-muted-foreground">{mensaje || 'Volvé a intentar en un rato.'}</p>
      </main>
    </Marco>
  );
}

/** Envuelve las pantallas de un trámite: apagado o en mantenimiento muestra el aviso (la API también lo rechaza). */
export function SoloSiActivo({ slug, children }: { slug: string; children: ReactNode }) {
  const { activos, mantenimiento } = useEstadoPublico();
  if (mantenimiento) return <Mantenimiento mensaje={mantenimiento.mensaje} />;
  if (activos && !activos.has(slug)) {
    return (
      <Marco>
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="text-2xl font-medium text-verde-700">Este trámite no está disponible por el momento</h1>
          <p className="mt-3 text-muted-foreground">Volvé a intentar más tarde o elegí otro trámite.</p>
          <Link to="/" className="mt-6 inline-block font-medium text-rosa-600 hover:underline">Ver los trámites disponibles</Link>
        </main>
      </Marco>
    );
  }
  return <>{children}</>;
}
