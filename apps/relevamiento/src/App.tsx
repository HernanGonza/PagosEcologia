import { useCallback, useEffect, useRef, useState } from 'react';
import { ESTADOS, PRIORIDAD, SECCIONES, TIPOS, WEB, type Kind, type Proceso } from './types';
import { GUIA } from './guia';

type Resumen = Omit<Proceso, 'items'>;
type Tab = 'procesos' | 'guia' | 'exportar';

const api = async <T,>(url: string, method = 'GET', body?: unknown): Promise<T> => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

export default function App() {
  const [tab, setTab] = useState<Tab>('procesos');
  const [lista, setLista] = useState<Resumen[]>([]);
  const [sel, setSel] = useState<number | null>(null);

  const cargar = useCallback(() => api<Resumen[]>('/api/procesos').then(setLista), []);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      <header className="top">
        <h1>Relevamiento de pagos</h1>
        <nav>
          {(['procesos', 'guia', 'exportar'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {{ procesos: 'Procesos', guia: 'Guía de relevamiento', exportar: 'Exportar' }[t]}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'procesos' && <Procesos lista={lista} sel={sel} setSel={setSel} recargar={cargar} />}
      {tab === 'guia' && <Guia />}
      {tab === 'exportar' && <Exportar />}
    </>
  );
}

function Procesos({ lista, sel, setSel, recargar }: { lista: Resumen[]; sel: number | null; setSel: (id: number | null) => void; recargar: () => void }) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const visibles = lista.filter((p) =>
    (!estado || p.estado === estado) &&
    `${p.titulo} ${p.area ?? ''} ${p.tipo ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  async function nuevo() {
    const p = await api<Proceso>('/api/procesos', 'POST', { titulo: 'Proceso nuevo', data: { estado: ESTADOS[0], web: WEB[0] } });
    await recargar();
    setSel(p.id);
  }

  return (
    <div className="split">
      <aside>
        <button className="primary block" onClick={nuevo}>+ Nuevo proceso</button>
        <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <p className="muted">{visibles.length} de {lista.length} procesos</p>
        <ul className="lista">
          {visibles.map((p) => (
            <li key={p.id} className={p.id === sel ? 'on' : ''} onClick={() => setSel(p.id)}>
              <strong>{p.titulo || '(sin título)'}</strong>
              <span>{[p.area, p.tipo].filter(Boolean).join(' · ') || '—'}</span>
              <span className="tags">
                <em className={`estado e${ESTADOS.indexOf(p.estado ?? '')}`}>{p.estado ?? ESTADOS[0]}</em>
                {p.web === WEB[2] && <em className="estado fuera">Fuera de la web</em>}
                <small>{p.cuenta?.paso ?? 0} pasos · {p.cuenta?.concepto ?? 0} conceptos</small>
              </span>
            </li>
          ))}
        </ul>
      </aside>
      <main>
        {sel ? <Editor key={sel} id={sel} alGuardar={recargar} alBorrar={() => { setSel(null); recargar(); }} />
          : <div className="vacio"><h2>Elegí un proceso o creá uno nuevo</h2>
            <p>Empezá por cargar la lista de todo lo que cobra el ministerio (una ficha por pago, con título y área nomás). Después completá el detalle de cada uno. Mirá la pestaña «Guía de relevamiento» para saber qué preguntar.</p></div>}
      </main>
    </div>
  );
}

function Editor({ id, alGuardar, alBorrar }: { id: number; alGuardar: () => void; alBorrar: () => void }) {
  const [p, setP] = useState<Proceso | null>(null);
  const [estado, setEstado] = useState<'ok' | 'guardando' | 'error'>('ok');
  const timer = useRef<number>();
  const sucio = useRef(false);

  useEffect(() => { api<Proceso>(`/api/procesos/${id}`).then(setP); }, [id]);

  const guardar = useCallback((v: Proceso) => {
    sucio.current = true;
    setEstado('guardando');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try { await api(`/api/procesos/${id}`, 'PUT', v); setEstado('ok'); sucio.current = false; alGuardar(); }
      catch { setEstado('error'); }
    }, 500);
  }, [id, alGuardar]);

  // Si se cierra la pestaña con cambios pendientes, el navegador avisa.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (sucio.current) e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  if (!p) return <p className="muted">Cargando…</p>;
  const cambiar = (v: Proceso) => { setP(v); guardar(v); };
  const set = (k: string, val: string) => cambiar({ ...p, [k]: val });

  const setItems = (kind: Kind, items: Record<string, string>[]) => cambiar({ ...p, items: { ...p.items, [kind]: items } });

  async function borrar() {
    if (!confirm(`¿Borrar «${p!.titulo}» con todos sus pasos y datos? No se puede deshacer.`)) return;
    await api(`/api/procesos/${id}`, 'DELETE');
    alBorrar();
  }
  async function duplicar() {
    const n = await api<Proceso>('/api/procesos', 'POST', { titulo: `${p!.titulo} (copia)` });
    await api(`/api/procesos/${n.id}`, 'PUT', { ...p, id: n.id, titulo: `${p!.titulo} (copia)` });
    alGuardar();
  }

  return (
    <div className="editor">
      <div className="bar">
        <input className="titulo" value={p.titulo} placeholder="Título del proceso" onChange={(e) => cambiar({ ...p, titulo: e.target.value })} />
        <span className={`save ${estado}`}>{{ ok: 'Guardado', guardando: 'Guardando…', error: 'ERROR al guardar' }[estado]}</span>
        <button onClick={duplicar}>Duplicar</button>
        <button className="danger" onClick={borrar}>Borrar</button>
      </div>

      <section className="grid2">
        <Sel label="Tipo" v={p.tipo} opts={TIPOS} on={(v) => set('tipo', v)} />
        <Txt label="Área / dirección" v={p.area} on={(v) => set('area', v)} />
        <Sel label="¿Va por la web?" v={p.web} opts={WEB} on={(v) => set('web', v)} />
        <Sel label="Estado del relevamiento" v={p.estado} opts={ESTADOS} on={(v) => set('estado', v)} />
        <Sel label="Prioridad" v={p.prioridad} opts={PRIORIDAD} on={(v) => set('prioridad', v)} />
        <Txt label="Volumen estimado (pagos por mes)" v={p.volumen} on={(v) => set('volumen', v)} />
        <Txt label="Responsable" v={p.responsable} on={(v) => set('responsable', v)} />
        <Txt label="Contacto (mail / teléfono)" v={p.contacto} on={(v) => set('contacto', v)} />
        <Txt label="Norma que lo habilita" v={p.norma} on={(v) => set('norma', v)} wide />
        <Txt label="Qué dispara el pago (acta, trámite, solicitud…)" v={p.disparador} on={(v) => set('disparador', v)} wide />
        <Txt label="Descripción" v={p.descripcion} on={(v) => set('descripcion', v)} large wide />
        <Txt label="Cómo se paga y se gestiona hoy" v={p.hoy} on={(v) => set('hoy', v)} large wide />
        <Txt label="Notas generales / dudas pendientes" v={p.notas} on={(v) => set('notas', v)} large wide />
      </section>

      {SECCIONES.map((s) => (
        <Lista key={s.kind} sec={s} items={p.items[s.kind]} onChange={(it) => setItems(s.kind, it)} />
      ))}
    </div>
  );
}

function Txt({ label, v = '', on, large, wide }: { label: string; v?: string; on: (v: string) => void; large?: boolean; wide?: boolean }) {
  return (
    <label className={wide ? 'wide' : ''}>{label}
      {large ? <textarea rows={3} value={v} onChange={(e) => on(e.target.value)} /> : <input value={v} onChange={(e) => on(e.target.value)} />}
    </label>
  );
}
function Sel({ label, v = '', opts, on }: { label: string; v?: string; opts: string[]; on: (v: string) => void }) {
  return (
    <label>{label}
      <select value={v} onChange={(e) => on(e.target.value)}>
        <option value="">—</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Lista({ sec, items, onChange }: { sec: (typeof SECCIONES)[number]; items: Record<string, string>[]; onChange: (i: Record<string, string>[]) => void }) {
  const mover = (i: number, d: number) => {
    const n = [...items]; const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  const edit = (i: number, k: string, v: string) => onChange(items.map((it, x) => (x === i ? { ...it, [k]: v } : it)));
  const quitar = (i: number) => {
    const it = items[i];
    const vacio = Object.values(it).every((v) => !v);
    if (!vacio && !confirm('¿Quitar este elemento?')) return;
    onChange(items.filter((_, x) => x !== i));
  };
  return (
    <section className="lista-sec">
      <h3>{sec.titulo} <small>({items.length})</small></h3>
      <p className="muted">{sec.ayuda}</p>
      {items.map((it, i) => (
        <div className="item" key={i}>
          <div className="num">{sec.kind === 'paso' ? i + 1 : '•'}</div>
          <div className="campos">
            {sec.campos.map((c) => (
              <label key={c.k} className={c.tipo === 'largo' || c.k === 'titulo' || c.k === 'nombre' ? 'wide' : ''}>{c.label}
                {c.tipo === 'largo' ? <textarea rows={2} value={it[c.k] ?? ''} onChange={(e) => edit(i, c.k, e.target.value)} />
                  : c.tipo === 'lista' ? (
                    <select value={it[c.k] ?? ''} onChange={(e) => edit(i, c.k, e.target.value)}>
                      <option value="">—</option>{c.opciones!.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : <input value={it[c.k] ?? ''} onChange={(e) => edit(i, c.k, e.target.value)} />}
              </label>
            ))}
          </div>
          <div className="acc">
            <button title="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>↑</button>
            <button title="Bajar" onClick={() => mover(i, 1)} disabled={i === items.length - 1}>↓</button>
            <button title="Quitar" className="danger" onClick={() => quitar(i)}>✕</button>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...items, {}])}>+ {sec.agregar}</button>
    </section>
  );
}

function Guia() {
  const [estado, setEstado] = useState<Record<string, { hecho: number; nota: string }>>({});
  useEffect(() => {
    api<{ clave: string; hecho: number; nota: string }[]>('/api/checklist')
      .then((r) => setEstado(Object.fromEntries(r.map((x) => [x.clave, x]))));
  }, []);
  const timers = useRef<Record<string, number>>({});
  const set = (clave: string, parche: Partial<{ hecho: number; nota: string }>) => {
    const nuevo = { ...{ hecho: 0, nota: "" }, ...estado[clave], ...parche };
    setEstado({ ...estado, [clave]: nuevo });
    window.clearTimeout(timers.current[clave]);
    timers.current[clave] = window.setTimeout(() => api(`/api/checklist/${clave}`, 'PUT', { hecho: !!nuevo.hecho, nota: nuevo.nota }), 400);
  };
  const total = GUIA.reduce((a, s) => a + s.items.length, 0);
  const hechos = GUIA.flatMap((s) => s.items).filter((i) => estado[i.clave]?.hecho).length;
  return (
    <div className="pagina">
      <h2>Guía de relevamiento</h2>
      <p className="muted">Qué ir a preguntar y conseguir. Tildá lo que ya tenés y anotá lo que te contestaron. {hechos} de {total} completos.</p>
      {GUIA.map((s) => (
        <section key={s.titulo} className="guia-sec">
          <h3>{s.titulo}</h3>
          <p className="muted">{s.intro}</p>
          {s.items.map((i) => (
            <div key={i.clave} className="chk">
              <label className="row"><input type="checkbox" checked={!!estado[i.clave]?.hecho} onChange={(e) => set(i.clave, { hecho: e.target.checked ? 1 : 0 })} /> {i.texto}</label>
              <textarea rows={1} placeholder="Notas / respuesta…" value={estado[i.clave]?.nota ?? ''} onChange={(e) => set(i.clave, { nota: e.target.value })} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Exportar() {
  async function markdown() {
    const d = await api<{ procesos: Proceso[] }>('/api/export.json');
    const L: string[] = ['# Relevamiento de pagos', ''];
    for (const p of d.procesos) {
      L.push(`## ${p.titulo}`, '');
      const meta: [string, string | undefined][] = [['Tipo', p.tipo], ['Área', p.area], ['¿Va por la web?', p.web], ['Estado', p.estado], ['Prioridad', p.prioridad],
        ['Volumen', p.volumen], ['Responsable', p.responsable], ['Contacto', p.contacto], ['Norma', p.norma], ['Dispara el pago', p.disparador]];
      for (const [k, v] of meta) if (v) L.push(`- **${k}:** ${v}`);
      for (const [k, v] of [['Descripción', p.descripcion], ['Cómo se gestiona hoy', p.hoy], ['Notas', p.notas]] as const) if (v) L.push('', `**${k}:** ${v}`);
      for (const s of SECCIONES) {
        const it = p.items[s.kind];
        if (!it.length) continue;
        L.push('', `### ${s.titulo}`, '');
        it.forEach((x, i) => {
          const [principal, ...resto] = s.campos;
          L.push(`${s.kind === 'paso' ? `${i + 1}.` : '-'} **${x[principal.k] || '(sin nombre)'}**`);
          for (const c of resto) if (x[c.k]) L.push(`   - ${c.label}: ${x[c.k]}`);
        });
      }
      L.push('');
    }
    descargar('relevamiento.md', L.join('\n'), 'text/markdown');
  }
  return (
    <div className="pagina">
      <h2>Exportar</h2>
      <p className="muted">Los datos viven en este equipo (<code>apps/relevamiento/data/relevamiento.db</code>). Exportá para compartir o hacer copia.</p>
      <p><button className="primary" onClick={markdown}>Descargar en Markdown (.md)</button></p>
      <p><a href="/api/export.json"><button>Descargar completo en JSON</button></a></p>
    </div>
  );
}

function descargar(nombre: string, texto: string, tipo: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}
