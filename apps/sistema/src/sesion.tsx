/**
 * Sesión de la administración del sistema: se entra con el usuario de Ecodatos (Supabase Auth) y la API
 * solo deja pasar a quienes son admin o superadmin en Ecodatos (/api/sistema/yo).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Solo desarrollo sin red: sin login, la API deja entrar como el usuario de pruebas (AUTH_LOCAL en el .env).
const authLocal = import.meta.env.VITE_AUTH_LOCAL === 'true';

export const supabaseConfigurado = authLocal || !!(url && anon);
const supabase = url && anon ? createClient(url, anon, { auth: { storageKey: 'sistema.sesion' } }) : null;

export interface UsuarioSistema {
  id: string;
  email: string;
  nombre: string | null;
}

export class ErrorApi extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

/** Pedido a la API con el token de la sesión. */
export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
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

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin-sesion' }
  | { tipo: 'lista'; usuario: UsuarioSistema }
  | { tipo: 'sin-permiso'; email: string }
  | { tipo: 'error'; mensaje: string };

interface ContextoSesion {
  estado: Estado;
  entrar: (email: string, clave: string) => Promise<void>;
  salir: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(async (sesion: Session | null) => {
    if (!sesion) return setEstado({ tipo: 'sin-sesion' });
    try {
      setEstado({ tipo: 'lista', usuario: await api<UsuarioSistema>('/sistema/yo') });
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 401) {
        await supabase?.auth.signOut();
        return setEstado({ tipo: 'sin-sesion' });
      }
      if (e instanceof ErrorApi && e.status === 403) return setEstado({ tipo: 'sin-permiso', email: sesion.user?.email ?? '' });
      setEstado({ tipo: 'error', mensaje: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    if (authLocal) {
      cargar({} as Session);
      return;
    }
    if (!supabase) return setEstado({ tipo: 'sin-sesion' });
    supabase.auth.getSession().then(({ data }) => cargar(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') cargar(sesion);
    });
    return () => data.subscription.unsubscribe();
  }, [cargar]);

  const entrar = useCallback(async (email: string, clave: string) => {
    if (!supabase) throw new Error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) throw new Error(/invalid login credentials/i.test(error.message) ? 'El mail o la contraseña no son correctos.' : error.message);
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

export function useUsuario(): UsuarioSistema {
  const { estado } = useSesion();
  if (estado.tipo !== 'lista') throw new Error('useUsuario sin sesión');
  return estado.usuario;
}

export function RequiereSesion({ children }: { children: ReactNode }) {
  const { estado, salir } = useSesion();
  const location = useLocation();
  if (estado.tipo === 'cargando') return null;
  if (estado.tipo === 'error') return <p className="p-8 text-center text-destructive">No se pudo validar tu ingreso: {estado.mensaje}</p>;
  if (estado.tipo === 'sin-permiso') {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-border bg-white p-8 text-center">
        <h1 className="text-xl font-medium text-verde-800">No tenés acceso a esta sección</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {estado.email ? `${estado.email} no es ` : 'Tu usuario no es '}administrador del sistema en Ecodatos. Esta sección es solo para el equipo técnico.
        </p>
        <button type="button" onClick={salir} className="mt-5 font-medium text-rosa-600 hover:underline">Salir</button>
      </div>
    );
  }
  if (estado.tipo === 'sin-sesion') return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  return <>{children}</>;
}
