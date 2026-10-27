import { createContext, useContext, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UsuarioAdmin } from '@botonera/shared';

/**
 * Sesión del panel. Por ahora NO hay login real: `iniciarSesion` acepta cualquier cosa (o nada)
 * y entra con un usuario de desarrollo. Cuando se conecte, este es el único lugar a cambiar:
 * `iniciarSesion` llama a la API, guarda lo que devuelve y `cerrarSesion` la invalida.
 */
export const LOGIN_CONECTADO = false;

const USUARIO_DESARROLLO: UsuarioAdmin = {
  nombre: 'Recaudaciones',
  email: 'sin login',
  rol: 'administrador',
  modulos: [],
};

const CLAVE = 'panel.sesion';

type Sesion = {
  usuario: UsuarioAdmin | null;
  iniciarSesion: (email: string, clave: string) => Promise<void>;
  cerrarSesion: () => void;
};

const SesionContext = createContext<Sesion | null>(null);

function leerGuardada(): UsuarioAdmin | null {
  try {
    const guardada = sessionStorage.getItem(CLAVE);
    return guardada ? (JSON.parse(guardada) as UsuarioAdmin) : null;
  } catch {
    return null;
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAdmin | null>(leerGuardada);

  async function iniciarSesion(email: string, _clave: string) {
    const nuevo = { ...USUARIO_DESARROLLO, email: email.trim() || USUARIO_DESARROLLO.email };
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(nuevo));
    } catch {
      // Sin storage la sesión dura hasta recargar la página.
    }
    setUsuario(nuevo);
  }

  function cerrarSesion() {
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {
      // nada que limpiar
    }
    setUsuario(null);
  }

  return <SesionContext.Provider value={{ usuario, iniciarSesion, cerrarSesion }}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const sesion = useContext(SesionContext);
  if (!sesion) throw new Error('useSesion tiene que usarse dentro de SesionProvider');
  return sesion;
}

/** Sin sesión, manda al login y vuelve a donde iba después de entrar. */
export function RequiereSesion({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const location = useLocation();
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  return children;
}
