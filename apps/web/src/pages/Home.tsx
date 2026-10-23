import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogoResponse } from '@botonera/shared';
import { getCatalogo } from '../lib/api';
import Icono from '../components/Icono';

export default function Home() {
  const [data, setData] = useState<CatalogoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    getCatalogo().then(setData).catch((e) => setError(e.message));
  }, []);

  const grupos = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.categorias
      .map((c) => ({
        ...c,
        modulos: data.modulos.filter(
          (m) => m.categoria_slug === c.slug && (!term || `${m.nombre} ${m.descripcion ?? ''}`.toLowerCase().includes(term)),
        ),
      }))
      .filter((g) => g.modulos.length);
  }, [data, q]);

  return (
    <>
      <header className="hero">
        <h1>Pagos y trámites</h1>
        <p>Ministerio de Ecología. Elegí qué querés pagar.</p>
        <input type="search" placeholder="Buscar un pago o trámite…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
      </header>
      <main className="container">
        {error && <p className="msg error">{error}</p>}
        {!data && !error && <p className="msg">Cargando…</p>}
        {data && !grupos.length && <p className="msg">No hay resultados.</p>}
        <div className="cols">
        {grupos.map((g) => (
          <section key={g.slug}>
            <h2>{g.nombre}</h2>
            <div className="grid">
              {g.modulos.map((m) => (
                <Link key={m.slug} to={`/pagar/${m.slug}`} className="card">
                  <Icono nombre={m.icono} />
                  <strong>{m.nombre}</strong>
                  {m.descripcion && <span>{m.descripcion}</span>}
                </Link>
              ))}
            </div>
          </section>
        ))}
        </div>
      </main>
    </>
  );
}
