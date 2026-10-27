import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Layout from './Layout';
import Login from './Login';
import { paneles } from './modules/registry';
import { BadgePendientes, PendientesProvider, usePendientes } from './pendientes';
import { RequiereSesion, SesionProvider, useYo } from './sesion';
import './index.css';

/** Inicio: una tarjeta por panel al que entra la persona, con las solicitudes nuevas de cada uno. */
function Inicio() {
  const { usuario, modulos } = useYo();
  const { pendientes } = usePendientes();
  const disponibles = modulos.filter((m) => paneles[m.slug]);
  if (!disponibles.length) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-white p-8 text-center">
        <h1 className="text-xl font-medium text-verde-800">No tenés paneles asignados</h1>
        <p className="mt-2 text-muted-foreground">
          El acceso sale de tus permisos en Ecodatos (el formulario o el área del trámite). Pedíselo al administrador de Ecodatos de tu área.
        </p>
      </div>
    );
  }
  const nombre = usuario.nombre?.split(' ')[0];
  return (
    <div>
      <span className="text-xs font-semibold tracking-[0.1em] text-rosa-600 uppercase">Paneles de área</span>
      <h1 className="mb-6 text-2xl font-medium text-verde-800">{nombre ? `Hola, ${nombre}` : 'Tus paneles'}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {disponibles.map((m) => {
          const { icono: Icono, descripcion } = paneles[m.slug];
          const n = pendientes[m.slug] ?? 0;
          return (
            <Link
              key={m.slug}
              to={`/${m.slug}`}
              className="group relative flex flex-col rounded-2xl border border-border bg-white p-6 transition-[border-color,box-shadow] hover:border-verde-500 hover:shadow-[0_12px_32px_rgba(33,19,13,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-sage-200 text-verde-700">
                  <Icono className="size-5" />
                </span>
                {n > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rosa-600/10 py-0.5 pr-2.5 pl-0.5 text-xs font-medium text-rosa-700">
                    <BadgePendientes n={n} />
                    {n === 1 ? 'nueva' : 'nuevas'}
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-lg font-medium text-verde-800">{m.nombre}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{descripcion}</p>
              <div className="mt-5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{m.puedeEditar ? (n ? 'Hay solicitudes para revisar' : 'Al día') : 'Solo lectura'}</span>
                <span className="inline-flex items-center gap-1 font-medium text-rosa-600">
                  Entrar <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Panel({ slug }: { slug: string }) {
  const { modulos } = useYo();
  const Componente = paneles[slug].componente;
  if (!modulos.some((m) => m.slug === slug)) return <Navigate to="/" replace />;
  return <Componente />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequiereSesion>
                  <PendientesProvider>
                    <Layout />
                  </PendientesProvider>
                </RequiereSesion>
              }
            >
              <Route index element={<Inicio />} />
              {Object.keys(paneles).map((slug) => (
                <Route key={slug} path={`/${slug}/*`} element={<Panel slug={slug} />} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
);
