import { useEffect, useState } from 'react';
import { api } from './sesion';

interface Persona { nombre: string | null; email: string | null; por?: string; editor?: boolean; rol?: string }
interface Accesos {
  administradores: (Persona & { rol: string })[];
  paneles: { slug: string; nombre: string; activo: boolean; formularios: string[]; areas: string[]; personas: Persona[] }[];
  recaudaciones: Persona[];
}

const quien = (p: Persona) => p.nombre || p.email || 'Sin nombre';
const caja = 'rounded-2xl border border-border bg-white p-5';

export default function Accesos() {
  const [d, setD] = useState<Accesos | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Accesos>('/sistema/accesos').then(setD, (e) => setError((e as Error).message));
  }, []);
  if (!d) return error ? <p role="alert" className="text-destructive">{error}</p> : <p className="text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-medium text-verde-800">Accesos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Quién entra a cada panel hoy. Solo lectura: los permisos se asignan en Ecodatos.</p>
      </div>

      <section className={caja}>
        <h2 className="font-medium">Administradores del sistema <span className="text-sm font-normal text-muted-foreground">(ven todo, incluido Recaudaciones)</span></h2>
        <ul className="mt-2 divide-y divide-border text-sm">
          {d.administradores.map((a, i) => (
            <li key={i} className="flex justify-between gap-4 py-2"><span>{quien(a)} <span className="text-muted-foreground">{a.email}</span></span><span className="text-muted-foreground">{a.rol}</span></li>
          ))}
          {!d.administradores.length && <li className="py-2 text-muted-foreground">Nadie.</li>}
        </ul>
      </section>

      <section className={caja}>
        <h2 className="font-medium">Recaudaciones <span className="text-sm font-normal text-muted-foreground">(área de Ecodatos «recaudaciones»)</span></h2>
        <ul className="mt-2 divide-y divide-border text-sm">
          {d.recaudaciones.map((a, i) => <li key={i} className="py-2">{quien(a)} <span className="text-muted-foreground">{a.email}</span></li>)}
          {!d.recaudaciones.length && <li className="py-2 text-muted-foreground">Nadie asignado todavía (solo entran los administradores).</li>}
        </ul>
      </section>

      {d.paneles.map((p) => (
        <section key={p.slug} className={caja}>
          <h2 className="font-medium">Panel de {p.nombre} {!p.activo && <span className="text-sm font-normal text-muted-foreground">(módulo apagado)</span>}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Da acceso: {[...p.formularios.map((f) => `formulario ${f}`), ...p.areas.map((a) => `área ${a}`)].join(', ') || '—'}
          </p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {p.personas.map((x, i) => (
              <li key={i} className="flex justify-between gap-4 py-2">
                <span>{quien(x)} <span className="text-muted-foreground">{x.email}</span></span>
                <span className="text-muted-foreground">{x.editor ? 'puede actuar' : 'solo lectura'} · {x.por}</span>
              </li>
            ))}
            {!p.personas.length && <li className="py-2 text-muted-foreground">Nadie asignado: solo lo ven los administradores.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
