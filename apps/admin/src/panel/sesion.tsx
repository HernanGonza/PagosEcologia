/**
 * Sesión del panel de Recaudaciones: se entra con el usuario de Ecodatos (Supabase Auth de la misma
 * instancia). La API (/api/admin/yo) deja pasar solo a admin/superadmin de Ecodatos o a quienes
 * pertenecen al área Recaudaciones.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { crearSesionEmpleado } from '@botonera/sesion';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Solo desarrollo sin red: sin login, la API deja entrar como el usuario de pruebas (AUTH_LOCAL en el .env).
const authLocal = import.meta.env.VITE_AUTH_LOCAL === 'true';

export const supabaseConfigurado = authLocal || !!(url && anon);
// Un solo lugar sabe con qué se inicia sesión (packages/sesion): hoy Ecodatos, mañana el login central.
const sesionEmpleado = crearSesionEmpleado(url, anon);

export interface UsuarioPanelFinanciero {
  id: string;
  email: string;
  nombre: string | null;
  /** false = solo lectura (área Recaudaciones sin permiso de edición). */
  puedeEditar: boolean;
}

export class ErrorApi extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

/** fetch a la API con el token de la sesión. */
export async function fetchAutenticado(ruta: string, opciones: RequestInit = {}): Promise<Response> {
  const token = await sesionEmpleado.token();
  return fetch(ruta, { ...opciones, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opciones.headers } });
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin-sesion' }
  | { tipo: 'lista'; usuario: UsuarioPanelFinanciero }
  | { tipo: 'sin-permiso'; email: string }
  | { tipo: 'error'; mensaje: string };

interface Sesion {
  estado: Estado;
  entrar: (email: string, clave: string) => Promise<void>;
  salir: () => Promise<void>;
}

const SesionContext = createContext<Sesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(async (haySesion: boolean) => {
    if (!haySesion) return setEstado({ tipo: 'sin-sesion' });
    try {
      const res = await fetchAutenticado(`${import.meta.env.VITE_API_BASE ?? '/api'}/admin/yo`);
      if (res.status === 401) {
        await sesionEmpleado.salir();
        return setEstado({ tipo: 'sin-sesion' });
      }
      if (res.status === 403) return setEstado({ tipo: 'sin-permiso', email: await sesionEmpleado.email() });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Error ${res.status}`);
      setEstado({ tipo: 'lista', usuario: (await res.json()) as UsuarioPanelFinanciero });
    } catch (e) {
      setEstado({ tipo: 'error', mensaje: (e as Error).message || 'No hay conexión con el servidor.' });
    }
  }, []);

  useEffect(() => {
    if (authLocal) {
      cargar(true);
      return;
    }
    if (!sesionEmpleado.configurado) return setEstado({ tipo: 'sin-sesion' });
    sesionEmpleado.haySesion().then(cargar);
    // Solo al iniciar o cerrar sesión: renovar el token no cambia los permisos.
    return sesionEmpleado.alCambiar(cargar);
  }, [cargar]);

  const entrar = useCallback(async (email: string, clave: string) => {
    await sesionEmpleado.ingresar(email, clave);
  }, []);

  const salir = useCallback(async () => {
    await sesionEmpleado.salir();
    setEstado({ tipo: 'sin-sesion' });
  }, []);

  return <SesionContext.Provider value={{ estado, entrar, salir }}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const sesion = useContext(SesionContext);
  if (!sesion) throw new Error('useSesion tiene que usarse dentro de SesionProvider');
  return sesion;
}

/** Sin sesión, manda al login y vuelve a donde iba después de entrar. */
export function RequiereSesion({ children }: { children: ReactNode }) {
  const { estado, salir } = useSesion();
  const location = useLocation();
  if (estado.tipo === 'cargando') return null;
  if (estado.tipo === 'error') return <p className="p-8 text-center text-destructive">No se pudo validar tu ingreso: {estado.mensaje}</p>;
  if (estado.tipo === 'sin-permiso') {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-border bg-white p-8 text-center">
        <h1 className="text-xl font-medium text-verde-800">No tenés acceso a Recaudaciones</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {estado.email ? `${estado.email} no pertenece ` : 'Tu usuario no pertenece '}al área Recaudaciones de Ecodatos. Pedí que te asignen esa área.
        </p>
        <button type="button" onClick={salir} className="mt-5 font-medium text-rosa-600 hover:underline">Salir</button>
      </div>
    );
  }
  if (estado.tipo === 'sin-sesion') return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  return children;
}
