/**
 * Sesión de EMPLEADOS en los fronts (paneles, Recaudaciones, administración). Es el ÚNICO lugar que sabe con qué
 * se inicia sesión: hoy es el Supabase Auth de Ecodatos. Cuando exista el login central del ministerio
 * (sistema.ecologia.misiones.gob.ar, que emite un JWT firmado), se cambia la implementación de este archivo y los
 * paneles no se enteran: solo piden el token (`token()`), inician (`ingresar`) y cierran (`salir`) sesión.
 *
 * Los tres paneles comparten UNA misma clave de almacenamiento: se entra una sola vez para todos
 * (están en el mismo origen, /pagos/...).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Clave única del almacenamiento: la comparten todos los paneles del mismo origen. */
export const CLAVE_SESION_EMPLEADO = 'botonera.empleado.sesion';

export interface SesionEmpleado {
  /** Hay con qué iniciar sesión (variables de entorno cargadas). */
  configurado: boolean;
  /** Token vigente para mandar en `Authorization: Bearer`, o null si no hay sesión. Se renueva solo. */
  token(): Promise<string | null>;
  /** Inicia sesión. Lanza Error con un mensaje listo para mostrar. */
  ingresar(email: string, clave: string): Promise<void>;
  salir(): Promise<void>;
  /** Mail de la persona con sesión (para mostrarlo, p. ej. en "sin permiso"). */
  email(): Promise<string>;
  /** ¿Hay una sesión guardada? */
  haySesion(): Promise<boolean>;
  /** Avisa cuando se inicia o se cierra sesión (no cuando solo se renueva el token). Devuelve la función para dejar de escuchar. */
  alCambiar(cb: (haySesion: boolean) => void): () => void;
}

export function crearSesionEmpleado(url?: string, anon?: string): SesionEmpleado {
  const supabase: SupabaseClient | null = url && anon ? createClient(url, anon, { auth: { storageKey: CLAVE_SESION_EMPLEADO } }) : null;
  return {
    configurado: !!supabase,
    async token() {
      return (await supabase?.auth.getSession())?.data.session?.access_token ?? null;
    },
    async ingresar(email, clave) {
      if (!supabase) throw new Error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
      if (error) throw new Error(/invalid login credentials/i.test(error.message) ? 'El mail o la contraseña no son correctos.' : error.message);
    },
    async salir() {
      await supabase?.auth.signOut();
    },
    async email() {
      return (await supabase?.auth.getSession())?.data.session?.user?.email ?? '';
    },
    async haySesion() {
      return !!(await supabase?.auth.getSession())?.data.session;
    },
    alCambiar(cb) {
      if (!supabase) return () => {};
      const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
        if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') cb(!!sesion);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
