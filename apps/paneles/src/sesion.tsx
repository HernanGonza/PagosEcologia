/**
 * Sesión de los paneles de área: se entra con el usuario y la contraseña de Ecodatos (Supabase
 * Auth de la misma instancia). Supabase maneja el token y su renovación; la API lo valida y
 * responde a qué paneles entra cada persona según sus permisos en Ecodatos (/api/paneles/yo).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { createClient, type Session } from '@supabase/supabase-js';
import type { YoPanel } from '@botonera/shared';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Solo desarrollo sin red: sin login, la API deja entrar a todos (AUTH_LOCAL en el .env).
const authLocal = import.meta.env.VITE_AUTH_LOCAL === 'true';

export const supabaseConfigurado = authLocal || !!(url && anon);
const supabase = supabaseConfigurado ? createClient(url!, anon!, { auth: { storageKey: 'paneles.sesion' } }) : null;

/** Token vigente (Supabase lo renueva solo). */
async function tokenActual(): Promise<string | null> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? null;
}

export class ErrorApi extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

/** Pedido a la API con el token de la sesión. */
export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const token = await tokenActual();
  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, {
      ...opciones,
      headers: {
        ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opciones.headers,
      },
    });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErrorApi(res.status, json.error ?? 'Ocurrió un error.');
  return json as T;
}

type Estado = { tipo: 'cargando' } | { tipo: 'sin-sesion' } | { tipo: 'lista'; yo: YoPanel } | { tipo: 'error'; mensaje: string };

interface ContextoSesion {
  estado: Estado;
  entrar: (email: string, clave: string) => Promise<void>;
  salir: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargarPermisos = useCallback(async (sesion: Session | null) => {
    if (!sesion) return setEstado({ tipo: 'sin-sesion' });
    try {
      setEstado({ tipo: 'lista', yo: await api<YoPanel>('/paneles/yo') });
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 401) {
        await supabase?.auth.signOut();
        return setEstado({ tipo: 'sin-sesion' });
      }
      setEstado({ tipo: 'error', mensaje: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    if (authLocal) {
      cargarPermisos({} as Session);
      return;
    }
    if (!supabase) return setEstado({ tipo: 'sin-sesion' });
    supabase.auth.getSession().then(({ data }) => cargarPermisos(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      // La renovación del token no cambia los permisos: no hace falta volver a pedirlos.
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') cargarPermisos(sesion);
    });
    return () => data.subscription.unsubscribe();
  }, [cargarPermisos]);

  const entrar = useCallback(async (email: string, clave: string) => {
    if (!supabase) throw new Error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) {
      throw new Error(/invalid login credentials/i.test(error.message) ? 'El mail o la contraseña no son correctos.' : error.message);
    }
  }, []);

  const salir = useCallback(async () => {
    await supabase?.auth.signOut();
    setEstado({ tipo: 'sin-sesion' });
  }, []);

  return <Contexto.Provider value={{ estado, entrar, salir }}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion fuera de SesionProvider');
  return c;
}

/** Los datos de la sesión, dentro de una ruta protegida. */
export function useYo(): YoPanel {
  const { estado } = useSesion();
  if (estado.tipo !== 'lista') throw new Error('useYo sin sesión');
  return estado.yo;
}

export function RequiereSesion({ children }: { children: ReactNode }) {
  const { estado } = useSesion();
  const location = useLocation();
  if (estado.tipo === 'cargando') return null;
  if (estado.tipo === 'error') {
    return <p className="p-8 text-center text-destructive">No se pudieron cargar tus permisos: {estado.mensaje}</p>;
  }
  if (estado.tipo === 'sin-sesion') return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  return <>{children}</>;
}
