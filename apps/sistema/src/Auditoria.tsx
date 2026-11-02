import { useEffect, useState } from 'react';
import { api } from './sesion';

interface Fila {
  id: number;
  actor: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  antes: unknown;
  despues: unknown;
  creadaEn: string;
}

const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' });

export default function Auditoria() {
  const [accion, setAccion] = useState('');
  const [datos, setDatos] = useState<{ acciones: string[]; filas: Fila[] } | null>(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    api<{ acciones: string[]; filas: Fila[] }>(`/sistema/auditoria${accion ? `?accion=${encodeURIComponent(accion)}` : ''}`).then(
      (d) => (setDatos(d), setError('')),
      (e) => setError((e as Error).message),
    );
  }, [accion]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-verde-800">Auditoría</h1>
          <p className="mt-1 text-sm text-muted-foreground">Los últimos 200 cambios del sistema: tarifas, módulos, mantenimiento y avisos.</p>
        </div>
        <label className="text-sm">
          <span className="mr-2 text-muted-foreground">Acción</span>
          <select value={accion} onChange={(e) => setAccion(e.target.value)} className="rounded-lg border border-input bg-white px-3 py-2">
            <option value="">Todas</option>
            {datos?.acciones.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {datos && !datos.filas.length && <p className="text-muted-foreground">No hay registros.</p>}
      {datos && datos.filas.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
          {datos.filas.map((f) => (
            <li key={f.id} className="px-5 py-3 text-sm">
              <button type="button" className="flex w-full flex-wrap items-baseline justify-between gap-x-4 text-left" onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                <span><b className="font-medium">{f.accion}</b> <span className="text-muted-foreground">· {f.entidad}{f.entidadId ? ` ${f.entidadId}` : ''}</span></span>
                <span className="text-xs text-muted-foreground">{f.actor} · {fecha(f.creadaEn)}</span>
              </button>
              {abierta === f.id && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-crema p-3 text-xs">{JSON.stringify({ antes: f.antes, despues: f.despues }, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
