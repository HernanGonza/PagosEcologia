import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import type { ObjetoVista, TitularFicha } from '@botonera/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { avisoError, avisoExito, pedirTexto } from '@/lib/alertas';
import { cn } from '@/lib/utils';
import { api, useYo } from '../../sesion';
import { RUTA, fecha, fechaHora } from './comunes';

const tono: Record<ObjetoVista['estado'], string> = {
  vigente: 'bg-ok/12 text-ok',
  vencido: 'bg-destructive/10 text-destructive',
  revocado: 'bg-destructive/10 text-destructive',
  sin_certificado: 'bg-muted text-muted-foreground',
};
const texto: Record<ObjetoVista['estado'], string> = { vigente: 'Vigente', vencido: 'Vencido', revocado: 'Revocado', sin_certificado: 'Sin certificado' };

/** Ficha de un titular: datos, representantes, objetos con sus certificados vigentes y el historial completo. */
export default function FichaTitular() {
  const { id } = useParams();
  const { modulos } = useYo();
  const puedeEditar = modulos.find((m) => m.slug === 'fitosanitarios')?.puedeEditar ?? false;
  const [t, setT] = useState<TitularFicha | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    api<TitularFicha>(`${RUTA}/titulares/${id}`).then((r) => (setT(r), setError('')), (e) => setError(e.message));
  }, [id]);
  useEffect(cargar, [cargar]);

  async function revocar(certId: string, numero: string) {
    const motivo = await pedirTexto(`Motivo de la revocación de ${numero}`, 'Revocar certificado', { peligro: true });
    if (!motivo) return;
    try {
      await api(`${RUTA}/certificados/${certId}/revocar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
      avisoExito('Certificado revocado');
      cargar();
    } catch (e) {
      avisoError('No se pudo revocar', (e as Error).message);
    }
  }
  async function darDeBaja(vinculoId: number, email: string) {
    const motivo = await pedirTexto(`Motivo de la baja de ${email}`, 'Dar de baja', { peligro: true });
    if (!motivo) return;
    try {
      await api(`${RUTA}/vinculos/${vinculoId}/baja`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
      avisoExito('Representante dado de baja');
      cargar();
    } catch (e) {
      avisoError('No se pudo dar de baja', (e as Error).message);
    }
  }

  const Volver = ({ children }: { children: React.ReactNode }) => (
    <div>
      <Link to=".." relative="path" className="mb-4 inline-flex items-center gap-1.5 text-sm text-verde-700 hover:underline">
        <ArrowLeft className="size-4" /> Titulares
      </Link>
      {children}
    </div>
  );
  if (!t) return <Volver>{error ? <p className="rounded-xl bg-destructive/8 px-4 py-3 text-destructive">{error}</p> : <Skeleton className="h-96" />}</Volver>;

  return (
    <Volver>
      <h1 className="text-2xl font-medium text-verde-800">{t.nombre}</h1>
      <p className="mt-1 text-muted-foreground">
        {[t.cuit && `CUIT ${t.cuit}`, t.dni && `DNI ${t.dni}`, t.tipoPersona === 'juridica' ? 'Persona jurídica' : 'Persona física', t.telefono, t.domicilio].filter(Boolean).join(' · ')}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="flex flex-col gap-4">
          {!t.objetos.length && <p className="rounded-2xl border border-border bg-white p-6 text-muted-foreground">Todavía no tiene certificados emitidos.</p>}
          {t.objetos.map((o) => (
            <article key={o.id} className="rounded-2xl border border-border bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{o.tipoNombre}</h2>
                {o.etiqueta && <span className="rounded-md bg-crema-200 px-2 py-0.5 font-mono text-sm">{o.etiqueta}</span>}
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', tono[o.estado])}>{texto[o.estado]}</span>
                {o.renovacionEnCurso && <span className="text-xs text-azul-600">Renovación en curso: {o.renovacionEnCurso}</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Registrado el {fecha(o.fechaRegistro)}
                {o.nroRegistro !== null && ` · N.º de registro ${o.nroRegistro}`}
                {o.venceEn && ` · vence el ${fecha(o.venceEn)}`}
                {o.diasParaVencer !== null && ` (${o.diasParaVencer >= 0 ? `faltan ${o.diasParaVencer} días` : `venció hace ${-o.diasParaVencer} días`})`}
              </p>
              {o.vtvVenceEn && (
                <p className={cn('mt-0.5 text-sm', o.vtvVencida ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                  VTV {o.vtvVencida ? 'vencida el' : 'vence el'} {fecha(o.vtvVenceEn)}
                </p>
              )}
              <ol className="mt-4 flex flex-col gap-2 border-l border-border pl-4 text-sm">
                {o.certificados.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <strong className="font-medium tabular-nums">{c.numero}</strong>
                    <span className="text-muted-foreground">{fecha(c.vigenteDesde)} → {fecha(c.venceEn)}</span>
                    <span className={cn('text-xs', c.estado === 'vigente' ? 'text-ok' : c.estado === 'revocado' || c.estado === 'vencido' ? 'text-destructive' : 'text-muted-foreground')}>
                      {{ vigente: 'vigente', por_comenzar: 'por comenzar', vencido: 'vencido', revocado: 'revocado' }[c.estado]}
                    </span>
                    {c.revocadoMotivo && <span className="text-xs text-muted-foreground">({c.revocadoMotivo})</span>}
                    <Button asChild variant="ghost" size="sm"><a href={`/api${RUTA}/certificados/${c.id}/pdf`} target="_blank" rel="noreferrer"><Download /> PDF</a></Button>
                    {puedeEditar && c.estado !== 'revocado' && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => revocar(c.id, c.numero)}>Revocar</Button>
                    )}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-2xl border border-border bg-white p-5">
            <h2 className="mb-3 font-medium">Representantes</h2>
            <ul className="flex flex-col gap-3 text-sm">
              {t.vinculos.map((v) => (
                <li key={v.id} className={cn(v.bajaEn && 'opacity-60')}>
                  <div className="break-all font-medium">{v.email}</div>
                  <div className="text-xs text-muted-foreground">
                    Aprobado {fechaHora(v.aprobadoEn)}{v.aprobadoPor && ` por ${v.aprobadoPor}`}
                  </div>
                  {v.bajaEn && <div className="text-xs text-destructive">Baja {fechaHora(v.bajaEn)} · {v.bajaMotivo}</div>}
                  {!v.bajaEn && v.bajaSolicitadaEn && <div className="text-xs text-aviso">Baja pedida por {v.bajaSolicitadaPor}</div>}
                  {!v.bajaEn && puedeEditar && (
                    <Button variant="ghost" size="sm" className="mt-1 px-0 text-destructive" onClick={() => darDeBaja(v.id, v.email)}>Dar de baja</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-border bg-white p-5">
            <h2 className="mb-3 font-medium">Solicitudes</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {t.solicitudes.map((s) => (
                <li key={s.id}>
                  <Link to={`../${s.id}`} relative="path" className="text-verde-700 hover:underline">{s.numero}</Link>{' '}
                  <span className="text-muted-foreground">· {s.tipoSolicitud === 'renovacion' ? 'renovación' : 'alta'} · {s.estado}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </Volver>
  );
}
