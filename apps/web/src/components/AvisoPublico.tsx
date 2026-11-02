import { Info, TriangleAlert } from 'lucide-react';
import { useEstadoPublico } from '../lib/estado-publico';

/** Franja de aviso general, arriba de la página. */
export default function AvisoPublico() {
  const { aviso } = useEstadoPublico();
  if (!aviso) return null;
  const alerta = aviso.nivel === 'alerta';
  const Icono = alerta ? TriangleAlert : Info;
  return (
    <div role="status" className={`flex items-start justify-center gap-2 px-4 py-2.5 text-sm ${alerta ? 'bg-amarillo-400/30 text-foreground' : 'bg-sage-200 text-verde-800'}`}>
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{aviso.texto}</span>
    </div>
  );
}
