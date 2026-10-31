import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import './index.css';

// Cada trámite se carga recién cuando se entra: la botonera no paga el peso de todos.
const Fitosanitarios = lazy(() => import('./modules/fitosanitarios'));
const FitosanitariosSolicitud = lazy(() => import('./modules/fitosanitarios/Solicitud'));
const FitosanitariosMisCertificados = lazy(() => import('./modules/fitosanitarios/MisCertificados'));
const FitosanitariosVerificar = lazy(() => import('./modules/fitosanitarios/Verificar'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pagar/fitosanitarios" element={<Fitosanitarios />} />
          <Route path="/pagar/fitosanitarios/solicitud" element={<FitosanitariosSolicitud />} />
          <Route path="/pagar/fitosanitarios/mis-certificados" element={<FitosanitariosMisCertificados />} />
          {/* Lo abre el QR del certificado. */}
          <Route path="/pagar/fitosanitarios/verificar/:codigo" element={<FitosanitariosVerificar />} />
          {/* Enlaces del formato anterior (token en la ruta): ya no valen. */}
          <Route path="/pagar/fitosanitarios/solicitud/:token" element={<Navigate to="/pagar/fitosanitarios?enlace=vencido" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
