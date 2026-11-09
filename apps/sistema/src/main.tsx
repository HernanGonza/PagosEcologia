import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import Login from './Login';
import Accesos from './Accesos';
import Auditoria from './Auditoria';
import Estado from './Estado';
import Mantenimiento from './Mantenimiento';
import Modulos from './Modulos';
import { RequiereSesion, SesionProvider } from './sesion';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <SesionProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequiereSesion>
                <Layout />
              </RequiereSesion>
            }
          >
            <Route index element={<Modulos />} />
            <Route path="mantenimiento" element={<Mantenimiento />} />
            <Route path="estado" element={<Estado />} />
            <Route path="auditoria" element={<Auditoria />} />
            <Route path="accesos" element={<Accesos />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
);
