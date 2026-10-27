import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import './index.css';

// Cada trámite se carga recién cuando se entra: la botonera no paga el peso de todos.
const Fitosanitarios = lazy(() => import('./modules/fitosanitarios'));
const FitosanitariosSolicitud = lazy(() => import('./modules/fitosanitarios/Solicitud'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pagar/fitosanitarios" element={<Fitosanitarios />} />
          <Route path="/pagar/fitosanitarios/solicitud/:token" element={<FitosanitariosSolicitud />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
