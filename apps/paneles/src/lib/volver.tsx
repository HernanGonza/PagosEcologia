import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate, type RelativeRoutingType } from 'react-router-dom';

/**
 * "Volver" que respeta de dónde se llegó: usa el historial del navegador (vuelve a la pantalla anterior, con su pestaña,
 * filtros y página). Solo si no hay historial dentro del panel (se abrió la URL directo) va a `fallback`, con su `etiqueta`.
 * Un destino fijo confundía: la ficha del titular, por ejemplo, se abre desde una solicitud y volvía al buscador.
 */
export function VolverAtras({
  etiqueta,
  fallback = '..',
  relative,
  className,
}: {
  etiqueta: string;
  fallback?: string;
  relative?: RelativeRoutingType;
  className?: string;
}) {
  const navigate = useNavigate();
  // `default` es la primera pantalla de la sesión de navegación: no hay un "atrás" dentro del panel.
  const hayAtras = useLocation().key !== 'default';
  return (
    <button type="button" onClick={() => (hayAtras ? navigate(-1) : navigate(fallback, { relative }))} className={className}>
      <ArrowLeft className="size-4" /> {hayAtras ? 'Volver' : etiqueta}
    </button>
  );
}
