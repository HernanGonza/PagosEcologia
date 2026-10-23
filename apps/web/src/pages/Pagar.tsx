import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Modulo } from '@botonera/shared';
import { getCatalogo } from '../lib/api';
import Icono from '../components/Icono';

type Paso = 'datos' | 'resumen' | 'procesando' | 'listo';

const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

// Flujo genérico mock: datos → resumen → pago simulado → comprobante.
// Los módulos "complejo" luego reemplazarán esto con un componente propio (React.lazy).
export default function Pagar() {
  const { slug } = useParams();
  const [modulo, setModulo] = useState<Modulo | null | undefined>(undefined);
  const [paso, setPaso] = useState<Paso>('datos');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [nroOperacion] = useState(() => String(Math.floor(Math.random() * 1e8)).padStart(8, '0'));

  useEffect(() => {
    getCatalogo().then((c) => setModulo(c.modulos.find((m) => m.slug === slug) ?? null));
  }, [slug]);

  if (modulo === undefined) return <main className="container"><p className="msg">Cargando…</p></main>;
  if (modulo === null) return <main className="container"><Link to="/">← Volver</Link><p className="msg">No existe ese pago.</p></main>;

  const onDatos = (e: FormEvent) => { e.preventDefault(); setPaso('resumen'); };
  const pagar = () => { setPaso('procesando'); setTimeout(() => setPaso('listo'), 1500); };

  return (
    <main className="container narrow">
      <Link to="/">← Volver a la botonera</Link>
      <div className="mod-head">
        <Icono nombre={modulo.icono} size={36} />
        <div>
          <h1>{modulo.nombre}</h1>
          {modulo.descripcion && <p className="msg">{modulo.descripcion}</p>}
        </div>
      </div>

      <ol className="steps" aria-label="Progreso">
        {['Datos', 'Resumen', 'Pago', 'Comprobante'].map((t, i) => {
          const actual = ['datos', 'resumen', 'procesando', 'listo'].indexOf(paso);
          return <li key={t} className={i === actual ? 'on' : i < actual ? 'done' : ''}>{t}</li>;
        })}
      </ol>

      <section className="panel">
        {paso === 'datos' && (
          <form onSubmit={onDatos}>
            {(modulo.campos ?? []).map((c) => (
              <label key={c.name}>
                {c.label}
                {c.type === 'select' ? (
                  <select required={c.required} value={valores[c.name] ?? ''} onChange={(e) => setValores({ ...valores, [c.name]: e.target.value })}>
                    <option value="" disabled>Elegí una opción</option>
                    {c.options?.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={c.type} required={c.required} placeholder={c.placeholder} value={valores[c.name] ?? ''} onChange={(e) => setValores({ ...valores, [c.name]: e.target.value })} />
                )}
              </label>
            ))}
            <button className="btn" type="submit">Continuar</button>
          </form>
        )}

        {paso === 'resumen' && (
          <>
            <dl className="resumen">
              {(modulo.campos ?? []).map((c) => (<div key={c.name}><dt>{c.label}</dt><dd>{valores[c.name]}</dd></div>))}
              <div className="total"><dt>Total a pagar</dt><dd>{pesos(modulo.monto ?? 0)}</dd></div>
            </dl>
            <div className="actions">
              <button className="btn ghost" onClick={() => setPaso('datos')}>Corregir</button>
              <button className="btn" onClick={pagar}>Pagar con MacroClick (simulado)</button>
            </div>
          </>
        )}

        {paso === 'procesando' && <p className="msg center">Procesando el pago…</p>}

        {paso === 'listo' && (
          <div className="ok">
            <h2>Pago aprobado (simulado)</h2>
            <p>Operación <strong>#{nroOperacion}</strong> por <strong>{pesos(modulo.monto ?? 0)}</strong>.</p>
            <div className="actions">
              <button className="btn ghost" onClick={() => window.print()}>Imprimir comprobante</button>
              <Link className="btn" to="/">Volver al inicio</Link>
            </div>
          </div>
        )}
      </section>
      <p className="msg small">Entorno de demostración: no se realiza ningún cobro real.</p>
    </main>
  );
}
