import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Search } from 'lucide-react';
import flor from '@botonera/marca/logos/flor-lapacho.svg';
import Icono from '../components/Icono';
import Marco from '../components/Marco';
import { modulosMenu } from '../modules/registry';

export default function Home() {
  const [busqueda, setBusqueda] = useState('');
  const grupos = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es-AR');
    const visibles = modulosMenu.filter((modulo) =>
      !q || `${modulo.nombre} ${modulo.descripcion} ${modulo.categoria}`.toLocaleLowerCase('es-AR').includes(q),
    );
    return [...new Set(visibles.map((modulo) => modulo.categoria))].map((categoria) => ({
      categoria,
      modulos: visibles.filter((modulo) => modulo.categoria === categoria),
    }));
  }, [busqueda]);

  return (
    <Marco>
      <section className="relative overflow-hidden bg-linear-to-br from-verde-600 via-verde-700 to-verde-800 text-white">
        {/* Flores del key visual en la esquina (Brandbook, pág. 17). */}
        <div className="pointer-events-none absolute -top-6 -right-4 hidden h-40 w-48 opacity-90 sm:block" aria-hidden="true">
          <img src={flor} alt="" className="absolute top-0 right-10 size-28" />
          <img src={flor} alt="" className="absolute top-20 right-0 size-14" />
          <img src={flor} alt="" className="absolute top-24 right-28 size-10" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <span className="text-xs font-medium tracking-[0.14em] text-rosa-300 uppercase">Ministerio de Ecología</span>
          <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-5xl">Pagos y trámites</h1>
          <p className="mt-2 max-w-xl text-white/80">Elegí el trámite que necesitás realizar y pagalo en línea.</p>
          <label className="relative mt-6 block max-w-xl">
            <span className="sr-only">Buscar un trámite</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Buscar un trámite…"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              className="w-full rounded-full border-0 bg-white py-3.5 pr-4 pl-12 text-base text-foreground shadow-lg outline-none placeholder:text-muted-foreground focus:ring-3 focus:ring-rosa-300"
            />
          </label>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {!grupos.length && <p className="text-center text-muted-foreground">No encontramos trámites con esa búsqueda.</p>}
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          {grupos.map((grupo) => (
            <section key={grupo.categoria}>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-medium text-verde-700">
                <span className="h-4 w-1 rounded-full bg-rosa-600" aria-hidden="true" />
                {grupo.categoria}
              </h2>
              <div className="flex flex-col gap-3">
                {grupo.modulos.map((modulo, i) => (
                  <motion.div
                    key={modulo.slug}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24, delay: i * 0.05 }}
                    whileHover={{ y: -3 }}
                  >
                    <Link
                      to={`/pagar/${modulo.slug}`}
                      className="group flex gap-4 rounded-2xl border border-border bg-white p-5 shadow-[0_1px_2px_rgba(33,19,13,0.06),0_6px_18px_rgba(33,19,13,0.04)] transition-colors hover:border-verde-500 focus-visible:ring-3 focus-visible:ring-rosa-600/30 focus-visible:outline-none"
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-crema-200 text-verde-600" aria-hidden="true">
                        <Icono nombre={modulo.icono} size={24} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <strong className="font-medium leading-snug text-foreground">{modulo.nombre}</strong>
                        <span className="text-sm text-muted-foreground">{modulo.descripcion}</span>
                        <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-rosa-600">
                          Ingresar al trámite
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </Marco>
  );
}
