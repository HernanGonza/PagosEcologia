import { pool } from '../db.js';

export interface Mantenimiento {
  activo: boolean;
  mensaje: string;
}
export interface Aviso {
  activo: boolean;
  texto: string;
  nivel: 'info' | 'alerta';
}

const POR_DEFECTO = {
  mantenimiento: { activo: false, mensaje: '' } satisfies Mantenimiento,
  aviso: { activo: false, texto: '', nivel: 'info' } satisfies Aviso,
};

/** Lee una configuración general (pagos.sistema_config). Sin fila, devuelve el valor por defecto. */
export async function leerConfig<K extends keyof typeof POR_DEFECTO>(clave: K): Promise<(typeof POR_DEFECTO)[K]> {
  const { rows } = await pool.query<{ valor: (typeof POR_DEFECTO)[K] }>('select valor from pagos.sistema_config where clave = $1', [clave]);
  return { ...POR_DEFECTO[clave], ...(rows[0]?.valor ?? {}) };
}
