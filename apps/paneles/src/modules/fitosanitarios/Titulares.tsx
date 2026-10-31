import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import type { TitularesResponse } from '@botonera/shared';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '../../sesion';
import { RUTA, fecha } from './comunes';

/** Buscador del padrón: por DNI, CUIT, nombre o razón social, número de certificado o patente. Cada búsqueda queda registrada. */
export default function Titulares() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [texto, setTexto] = useState(q);
  const [datos, setDatos] = useState<TitularesResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (texto.trim() === q) return;
    const t = setTimeout(() => setParams(texto.trim() ? { q: texto.trim() } : {}, { replace: true }), 450);
    return () => clearTimeout(t);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!q) return setDatos(null);
    let vigente = true;
    api<TitularesResponse>(`${RUTA}/titulares?q=${encodeURIComponent(q)}`)
      .then((r) => vigente && (setDatos(r), setError('')))
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [q]);

  return (
    <div>
      <Link to=".." className="mb-4 inline-flex items-center gap-1.5 text-sm text-verde-700 hover:underline">
        <ArrowLeft className="size-4" /> Solicitudes
      </Link>
      <span className="block text-xs font-semibold tracking-[0.1em] text-rosa-600 uppercase">Fitosanitarios</span>
      <h1 className="mb-2 text-2xl font-medium text-verde-800">Titulares y certificados</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Buscá por DNI, CUIT, nombre o razón social, número de certificado (CERT-…) o patente. Son datos personales: cada búsqueda queda registrada.
      </p>
      <div className="relative mb-6 max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="DNI, CUIT, nombre, certificado o patente" aria-label="Buscar titulares" className="h-11 bg-white pl-9" />
      </div>

      {error && <p className="rounded-xl bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p>}
      {q && !datos && !error && <Skeleton className="h-24" />}
      {datos && (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          {!datos.filas.length ? (
            <p className="px-6 py-12 text-center text-muted-foreground">No hay titulares que coincidan.</p>
          ) : (
            <ul className="divide-y divide-border">
              {datos.filas.map((t) => (
                <li key={t.id}>
                  <Link to={t.id} className="grid gap-1 px-4 py-3.5 transition-colors hover:bg-crema/60 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.nombre}</div>
                      <div className="text-sm text-muted-foreground">{[t.cuit && `CUIT ${t.cuit}`, t.dni && `DNI ${t.dni}`].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="text-sm sm:text-right">
                      <div>
                        <strong className={t.vigentes ? 'text-ok' : 'text-muted-foreground'}>{t.vigentes}</strong> de {t.objetos} vigentes
                      </div>
                      {t.proximoVencimiento && <div className="text-xs text-muted-foreground">Próximo vencimiento: {fecha(t.proximoVencimiento)}</div>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
