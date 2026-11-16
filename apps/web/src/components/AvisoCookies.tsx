import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';

const CLAVE = 'aviso-cookies-visto';

const yaVisto = () => {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false; // sin almacenamiento (ventana privada, bloqueado): el aviso simplemente se vuelve a mostrar
  }
};

/**
 * Aviso informativo, NO un banner de aceptar/rechazar: el sitio usa una única cookie técnica de sesión
 * (HttpOnly, SameSite=Strict) y no carga analítica ni recursos de terceros. Se descarta con "Entendido".
 */
export default function AvisoCookies() {
  const [visto, setVisto] = useState(yaVisto);
  if (visto) return null;
  function entendido() {
    try {
      localStorage.setItem(CLAVE, '1');
    } catch {
      /* se oculta igual hasta que se recargue la página */
    }
    setVisto(true);
  }
  return (
    <div role="region" aria-label="Aviso sobre cookies" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-crema-200 px-4 py-2.5 text-sm text-verde-800 print:hidden">
      <Cookie className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Usamos una única cookie técnica para mantener tu sesión mientras hacés el trámite. No usamos cookies de seguimiento ni de publicidad.{' '}
        <Link to="/cookies" className="font-medium underline underline-offset-2">
          Más información
        </Link>
      </span>
      <button type="button" onClick={entendido} className="rounded-md border border-verde-700 px-3 py-1 font-medium hover:bg-white">
        Entendido
      </button>
    </div>
  );
}
