import { useCallback, useEffect, useState } from 'react';
import { confirmar } from '@/lib/alertas';
import { api } from './sesion';

interface ModuloSistema {
  slug: string;
  nombre: string;
  categoria: string;
  activo: boolean;
}

/** Encender y apagar módulos. Apagado: no se ve en la página pública y su API pública deja de responder. */
export default function Modulos() {
  const [modulos, setModulos] = useState<ModuloSistema[] | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setModulos(await api<ModuloSistema[]>('/sistema/modulos'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiar(m: ModuloSistema) {
    if (m.activo && !(await confirmar({
      titulo: `¿Apagar «${m.nombre}»?`,
      texto: 'Deja de verse en la página pública y la gente ya no podrá entrar ni escribiendo la dirección. Las solicitudes y certificados existentes no se tocan.',
      boton: 'Apagar',
      icono: 'warning',
    }))) return;
    setGuardando(m.slug);
    setError('');
    try {
      await api(`/sistema/modulos/${m.slug}`, { method: 'PATCH', body: JSON.stringify({ activo: !m.activo }) });
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
    setGuardando(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-medium text-verde-800">Módulos</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Lo que se apaga desaparece de la página pública y no se puede abrir escribiendo la dirección. Los técnicos de cada área siguen pudiendo terminar lo que tienen en curso. Cada cambio queda en la auditoría.
      </p>
      {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!modulos && !error && <p className="text-muted-foreground">Cargando…</p>}
      {modulos && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
          {modulos.map((m) => (
            <li key={m.slug} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="truncate font-medium">{m.nombre}</div>
                <div className="text-xs text-muted-foreground">{m.categoria} · /pagar/{m.slug}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-sm ${m.activo ? 'font-medium text-verde-700' : 'text-muted-foreground'}`}>{m.activo ? 'Encendido' : 'Apagado'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={m.activo}
                  aria-label={`${m.activo ? 'Apagar' : 'Encender'} ${m.nombre}`}
                  disabled={guardando === m.slug}
                  onClick={() => cambiar(m)}
                  className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${m.activo ? 'bg-verde-600' : 'bg-muted-foreground/40'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform ${m.activo ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
