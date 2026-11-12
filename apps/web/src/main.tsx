import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import NoEncontrada from './pages/NoEncontrada';
import { SoloSiActivo } from './lib/modulos-activos';
import './index.css';

// Cada trámite se carga recién cuando se entra: la botonera no paga el peso de todos.
const Fitosanitarios = lazy(() => import('./modules/fitosanitarios'));
const FitosanitariosSolicitud = lazy(() => import('./modules/fitosanitarios/Solicitud'));
const FitosanitariosMisCertificados = lazy(() => import('./modules/fitosanitarios/MisCertificados'));
const FitosanitariosVerificar = lazy(() => import('./modules/fitosanitarios/Verificar'));
const Consultores = lazy(() => import('./modules/consultores'));
const ConsultoresSolicitud = lazy(() => import('./modules/consultores/Solicitud'));
const ConsultoresMisCertificados = lazy(() => import('./modules/consultores/MisCertificados'));
const ConsultoresVerificar = lazy(() => import('./modules/consultores/Verificar'));
const Reservas = lazy(() => import('./modules/reservas'));
const ReservasSolicitud = lazy(() => import('./modules/reservas/Solicitud'));
const ReservasMisCertificados = lazy(() => import('./modules/reservas/MisCertificados'));
const ReservasVerificar = lazy(() => import('./modules/reservas/Verificar'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pagar/fitosanitarios" element={<SoloSiActivo slug="fitosanitarios"><Fitosanitarios /></SoloSiActivo>} />
          <Route path="/pagar/fitosanitarios/solicitud" element={<SoloSiActivo slug="fitosanitarios"><FitosanitariosSolicitud /></SoloSiActivo>} />
          <Route path="/pagar/fitosanitarios/mis-certificados" element={<SoloSiActivo slug="fitosanitarios"><FitosanitariosMisCertificados /></SoloSiActivo>} />
          {/* Lo abre el QR del certificado. */}
          <Route path="/pagar/fitosanitarios/verificar/:codigo" element={<FitosanitariosVerificar />} />
          {/* Enlaces del formato anterior (token en la ruta): ya no valen. */}
          <Route path="/pagar/fitosanitarios/solicitud/:token" element={<Navigate to="/pagar/fitosanitarios?enlace=vencido" replace />} />
          <Route path="/pagar/consultores" element={<SoloSiActivo slug="consultores"><Consultores /></SoloSiActivo>} />
          <Route path="/pagar/consultores/solicitud" element={<SoloSiActivo slug="consultores"><ConsultoresSolicitud /></SoloSiActivo>} />
          <Route path="/pagar/consultores/mis-certificados" element={<SoloSiActivo slug="consultores"><ConsultoresMisCertificados /></SoloSiActivo>} />
          {/* Lo abre el QR del certificado. */}
          <Route path="/pagar/consultores/verificar/:codigo" element={<ConsultoresVerificar />} />
          {/* Enlaces del formato anterior (token en la ruta): ya no valen. */}
          <Route path="/pagar/consultores/solicitud/:token" element={<Navigate to="/pagar/consultores?enlace=vencido" replace />} />
          <Route path="/pagar/reservas" element={<SoloSiActivo slug="reservas"><Reservas /></SoloSiActivo>} />
          <Route path="/pagar/reservas/solicitud" element={<SoloSiActivo slug="reservas"><ReservasSolicitud /></SoloSiActivo>} />
          <Route path="/pagar/reservas/mis-certificados" element={<SoloSiActivo slug="reservas"><ReservasMisCertificados /></SoloSiActivo>} />
          {/* Lo abre el QR del certificado. */}
          <Route path="/pagar/reservas/verificar/:codigo" element={<ReservasVerificar />} />
          {/* Enlaces del formato anterior (token en la ruta): ya no valen. */}
          <Route path="/pagar/reservas/solicitud/:token" element={<Navigate to="/pagar/reservas?enlace=vencido" replace />} />
          {/* Cualquier otra dirección: página 404 (no queda en blanco). */}
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
