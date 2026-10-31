// "Mis certificados": con el mail verificado la persona ve los titulares de los que es representante,
// sus certificados y vencimientos, y renueva uno o varios. La búsqueda por DNI/CUIT no es pública.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Download, History, Loader2, LogOut, MailCheck, RefreshCcw } from 'lucide-react';
import type { MisTitularesResponse, ObjetoVista } from '@botonera/shared';
import { etiquetasEstado } from '@botonera/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/watermelon/floating-input';
import { cn } from '@/lib/utils';
import { api, ErrorApi, fecha, persona } from './api';
import { Aviso, Pagina, Tarjeta } from './comunes';

type Titular = MisTitularesResponse['titulares'][number];

const colorObjeto: Record<ObjetoVista['estado'], string> = {
  vigente: 'bg-ok/12 text-ok',
  vencido: 'bg-destructive/10 text-destructive',
  revocado: 'bg-destructive/10 text-destructive',
  sin_certificado: 'bg-crema-200 text-verde-800',
};
const textoObjeto: Record<ObjetoVista['estado'], string> = {
  vigente: 'Vigente', vencido: 'Vencido', revocado: 'Revocado', sin_certificado: 'Sin certificado',
};

const dias = (n: number) => (n === 0 ? 'vence hoy' : n > 0 ? `vence en ${n} ${n === 1 ? 'día' : 'días'}` : `venció hace ${-n} ${n === -1 ? 'día' : 'días'}`);

function Ingreso({ alEntrar }: { alEntrar: () => void }) {
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [paso, setPaso] = useState<'mail' | 'codigo'>('mail');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function pedir(e?: FormEvent) {
    e?.preventDefault();
    setOcupado(true);
    setError('');
    try {
      await api.pedirCodigo(email, 'persona');
      setCodigo('');
      setPaso('codigo');
    } catch (err) {
      setError((err as Error).message);
    }
    setOcupado(false);
  }
  async function entrar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      await persona.entrar(email, codigo.trim());
      alEntrar();
    } catch (err) {
      setError((err as Error).message);
      setOcupado(false);
    }
  }

  return (
    <Tarjeta k="ingreso">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-crema-200 text-verde-600">
        <MailCheck className="size-6" />
      </span>
      <h2 className="text-xl font-medium text-verde-800">Entrá con tu mail</h2>
      <p className="mt-1 text-muted-foreground">
        {paso === 'mail'
          ? 'Te mandamos un código para confirmar que el mail es tuyo. Vas a ver los certificados de los titulares a los que tu mail está vinculado.'
          : <>Te mandamos un código de 6 números a <strong className="text-foreground">{email}</strong>. Vence en 15 minutos.</>}
      </p>
      <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={paso === 'mail' ? pedir : entrar}>
        <div className="flex-1">
          {paso === 'mail' ? (
            <FloatingInput label="Mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} labelClassName="bg-white" className="h-12 bg-white text-base" />
          ) : (
            <FloatingInput
              label="Código"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              labelClassName="bg-white"
              className="h-12 bg-white text-base tracking-[0.4em]"
            />
          )}
        </div>
        <Button type="submit" size="lg" className="h-12 rounded-lg px-6" disabled={ocupado || (paso === 'codigo' && codigo.length !== 6)}>
          {paso === 'mail' ? 'Enviar código' : 'Entrar'}
        </Button>
      </form>
      {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
      {paso === 'codigo' && (
        <div className="mt-4 flex gap-x-4">
          <Button variant="link" className="px-0 text-verde-700" onClick={() => pedir()} disabled={ocupado}>Mandar otro código</Button>
          <Button variant="link" className="px-0 text-verde-700" onClick={() => setPaso('mail')}>Cambiar el mail</Button>
        </div>
      )}
    </Tarjeta>
  );
}

function FilaObjeto({ o, elegido, alternar }: { o: ObjetoVista; elegido: boolean; alternar: () => void }) {
  const [historial, setHistorial] = useState(false);
  const actual = o.certificados.find((c) => c.id === o.certificadoActualId);
  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <input
          type="checkbox"
          checked={elegido}
          disabled={!o.puedeRenovar}
          onChange={alternar}
          aria-label={`Renovar ${o.etiqueta ?? o.tipoNombre ?? 'certificado'}`}
          className="mt-1.5 size-5 accent-[var(--color-verde-600)] disabled:opacity-30"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {o.tipoNombre}
            {o.etiqueta && <span className="rounded-md bg-crema-200 px-2 py-0.5 font-mono text-sm text-verde-800">{o.etiqueta}</span>}
            <Badge className={cn('border-0', colorObjeto[o.estado])}>{textoObjeto[o.estado]}</Badge>
          </p>
          {o.venceEn && (
            <p className="mt-1 text-sm text-muted-foreground">
              Vence el <strong className="text-foreground">{fecha(o.venceEn)}</strong>
              {o.diasParaVencer !== null && ` (${dias(o.diasParaVencer)})`}
            </p>
          )}
          {o.vtvVenceEn && (
            <p className={cn('mt-0.5 flex items-center gap-1 text-sm', o.vtvVencida ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              {o.vtvVencida && <AlertTriangle className="size-4" />}
              VTV {o.vtvVencida ? 'vencida el' : 'vence el'} {fecha(o.vtvVenceEn)}
            </p>
          )}
          {!o.puedeRenovar && o.motivoNoRenovar && <p className="mt-1 text-xs text-muted-foreground">{o.motivoNoRenovar}</p>}
        </div>
        <div className="flex gap-2">
          {actual && (
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <a href={persona.urlPdf(actual.id)} target="_blank" rel="noreferrer"><Download /> Certificado</a>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setHistorial(!historial)} aria-expanded={historial}>
            <History /> Historial
          </Button>
        </div>
      </div>
      {historial && (
        <ol className="mt-3 flex flex-col gap-2 border-l-2 border-crema-300 pl-4 text-sm">
          {o.certificados.map((c) => (
            <li key={c.id}>
              <strong className="font-medium">{c.numero}</strong> · {fecha(c.vigenteDesde)} a {fecha(c.venceEn)} ·{' '}
              <span className="text-muted-foreground">{{ vigente: 'vigente', por_comenzar: 'por comenzar', vencido: 'vencido', revocado: 'revocado' }[c.estado]}</span>
              {c.revocadoMotivo && <span className="text-destructive"> · {c.revocadoMotivo}</span>}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function TarjetaTitular({ t, elegidos, alternar, recargar }: { t: Titular; elegidos: Set<string>; alternar: (id: string) => void; recargar: () => void }) {
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  async function bajaPropia() {
    if (!window.confirm('¿Querés dejar de ser representante de este titular? Vas a dejar de ver sus certificados.')) return;
    setError('');
    try {
      await persona.bajaPropia(t.id);
      recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function pedirBaja(id: number) {
    setError('');
    try {
      await persona.pedirBaja(id);
      setAviso('Pedimos la baja a los técnicos del área; te avisamos cuando la resuelvan.');
      recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium text-verde-800">{t.nombre}</h2>
        <p className="text-sm text-muted-foreground">{t.cuit ? `CUIT ${t.cuit}` : `DNI ${t.dni}`}</p>
      </header>
      {t.objetos.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Todavía no tiene certificados emitidos.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {t.objetos.map((o) => (
            <FilaObjeto key={o.id} o={o} elegido={!!o.certificadoActualId && elegidos.has(o.certificadoActualId)} alternar={() => o.certificadoActualId && alternar(o.certificadoActualId)} />
          ))}
        </ul>
      )}
      {t.misSolicitudes.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-verde-700">Mis solicitudes</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {t.misSolicitudes.map((s) => (
              <li key={s.id}>
                <Link to={`/pagar/fitosanitarios/solicitud?n=${s.numero}`} className="inline-flex items-center gap-1 text-verde-700 hover:underline">
                  {s.numero} · {s.tipoSolicitud === 'renovacion' ? 'Renovación' : 'Alta'} · {etiquetasEstado[s.estado as keyof typeof etiquetasEstado] ?? s.estado} <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Representantes y bajas</summary>
        <ul className="mt-3 flex flex-col gap-2">
          {t.representantes.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{r.email}{r.soyYo && <span className="text-muted-foreground"> (vos)</span>}</span>
              {r.soyYo ? (
                <Button variant="outline" size="sm" className="rounded-lg" onClick={bajaPropia}>Dejar de representar</Button>
              ) : r.bajaSolicitada ? (
                <span className="text-muted-foreground">Baja pedida</span>
              ) : (
                <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => pedirBaja(r.id)}>Pedir su baja</Button>
              )}
            </li>
          ))}
        </ul>
        {aviso && <div className="mt-3"><Aviso tono="ok">{aviso}</Aviso></div>}
        {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
      </details>
    </section>
  );
}

export default function MisCertificados() {
  const [datos, setDatos] = useState<MisTitularesResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [renovando, setRenovando] = useState(false);
  const [creadas, setCreadas] = useState<{ numero: string }[]>([]);

  const cargar = useCallback(async () => {
    try {
      setDatos(await persona.misTitulares());
    } catch (err) {
      if (!(err instanceof ErrorApi && err.status === 401)) setError((err as Error).message);
      setDatos(null);
    }
    setCargando(false);
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alternar = (id: string) =>
    setElegidos((previo) => {
      const nuevo = new Set(previo);
      if (!nuevo.delete(id)) nuevo.add(id);
      return nuevo;
    });

  async function renovar() {
    setRenovando(true);
    setError('');
    try {
      const r = await persona.renovar([...elegidos]);
      setCreadas(r.solicitudes);
      setElegidos(new Set());
      await cargar();
    } catch (err) {
      setError((err as Error).message);
    }
    setRenovando(false);
  }
  async function salir() {
    await persona.salir().catch(() => undefined);
    setDatos(null);
    setCreadas([]);
  }

  return (
    <Pagina
      titulo="Mis certificados"
      bajada="Los certificados de los titulares que representás, con sus vencimientos. Podés renovar uno o varios a la vez."
    >
      {cargando ? (
        <Loader2 className="size-6 animate-spin text-verde-600" />
      ) : !datos ? (
        <>
          {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}
          <Ingreso alEntrar={() => { setCargando(true); void cargar(); }} />
        </>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>Sesión de <strong className="text-foreground">{datos.email}</strong></span>
            <Button variant="ghost" size="sm" className="rounded-lg" onClick={salir}><LogOut /> Salir</Button>
          </div>

          {creadas.length > 0 && (
            <Aviso tono="ok">
              Preparamos {creadas.length === 1 ? 'la renovación' : `${creadas.length} renovaciones`}. Revisá y enviá cada una:{' '}
              {creadas.map((c, i) => (
                <span key={c.numero}>
                  {i > 0 && ', '}
                  <Link to={`/pagar/fitosanitarios/solicitud?n=${c.numero}`} className="font-medium underline">{c.numero}</Link>
                </span>
              ))}
              . Las que no tengan cambios se aprueban solas.
            </Aviso>
          )}

          {datos.titulares.length === 0 && (
            <Tarjeta k="vacio">
              <h2 className="text-lg font-medium text-verde-800">Todavía no tenés certificados vinculados a este mail</h2>
              <p className="mt-1 text-muted-foreground">
                Cuando los técnicos aprueban una solicitud, ese mail queda vinculado al titular y sus certificados aparecen acá.
              </p>
              <Button asChild className="mt-4 rounded-lg"><Link to="/pagar/fitosanitarios">Iniciar una solicitud</Link></Button>
            </Tarjeta>
          )}

          {datos.titulares.map((t) => (
            <TarjetaTitular key={t.id} t={t} elegidos={elegidos} alternar={alternar} recargar={() => void cargar()} />
          ))}

          {datos.solicitudesSinTitular.length > 0 && (
            <section className="rounded-2xl border border-dashed border-border p-5">
              <h2 className="font-medium text-verde-800">Solicitudes en trámite</h2>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {datos.solicitudesSinTitular.map((s) => (
                  <li key={s.id}>
                    <Link to={`/pagar/fitosanitarios/solicitud?n=${s.numero}`} className="inline-flex items-center gap-1 text-verde-700 hover:underline">
                      {s.numero} · {etiquetasEstado[s.estado as keyof typeof etiquetasEstado] ?? s.estado} <ArrowRight className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && <Aviso>{error}</Aviso>}

          {elegidos.size > 0 && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-verde-500 bg-white p-4 shadow-lg">
              <p className="text-sm">
                <strong>{elegidos.size}</strong> {elegidos.size === 1 ? 'certificado elegido' : 'certificados elegidos'}. La tasa se paga al aprobarse; los importes se suman.
              </p>
              <Button size="lg" className="rounded-lg" disabled={renovando} onClick={renovar}>
                {renovando ? <Loader2 className="animate-spin" /> : <RefreshCcw />} Renovar
              </Button>
            </div>
          )}
        </div>
      )}
    </Pagina>
  );
}
