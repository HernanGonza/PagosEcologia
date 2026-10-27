import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import PanelLayout from '@/panel/PanelLayout';
import { RequiereSesion, SesionProvider } from '@/panel/sesion';
import './index.css';

const Login = lazy(() => import('@/panel/Login'));
const Resumen = lazy(() => import('@/panel/paginas/Resumen'));
const Pagos = lazy(() => import('@/panel/paginas/Pagos'));
const Tramites = lazy(() => import('@/panel/paginas/Tramites'));
const Auditoria = lazy(() => import('@/panel/paginas/Auditoria'));
const Pendiente = lazy(() => import('@/panel/paginas/Pendiente'));

const cargando = <div className="p-8 text-sm text-muted-foreground">Cargando…</div>;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <SesionProvider>
          <Suspense fallback={cargando}>
            <Routes>
              <Route path="login" element={<Login />} />
              <Route
                element={
                  <RequiereSesion>
                    <PanelLayout />
                  </RequiereSesion>
                }
              >
                <Route index element={<Resumen />} />
                <Route path="pagos" element={<Pagos />} />
                <Route
                  path="conciliacion"
                  element={
                    <Pendiente
                      titulo="Conciliación"
                      items={[
                        'Cruce diario de los pagos registrados con lo que informa MacroClick y con lo acreditado en el banco.',
                        'Marcar pagos conciliados, pendientes y con diferencias (pagados sin orden, órdenes sin pago, montos distintos) y resolverlos con nota.',
                        'Necesita: manual técnico de MacroClick y cómo concilia hoy Recaudaciones.',
                      ]}
                    />
                  }
                />
                <Route path="tramites" element={<Tramites />} />
                <Route
                  path="reportes"
                  element={
                    <Pendiente
                      titulo="Reportes"
                      items={[
                        'Reporte diario para Tesorería y reportes por trámite, categoría y período.',
                        'Exportables a Excel/CSV y PDF con los mismos filtros del listado de pagos.',
                        'Necesita: el formato que define Contaduría.',
                      ]}
                    />
                  }
                />
                <Route path="auditoria" element={<Auditoria />} />
              </Route>
            </Routes>
          </Suspense>
        </SesionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </StrictMode>,
);
