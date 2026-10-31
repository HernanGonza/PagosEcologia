// Solicitud de fitosanitarios, a la que la persona entra con su enlace privado. Según el estado:
// cargar o corregir requisitos, esperar la revisión, pagar (cuando se integre) o ver el motivo de rechazo.
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, Check, CircleX, Clock, Eye, FileText, Hourglass, Loader2, Upload } from 'lucide-react';
import {
  etiquetasEstado,
  formatosDocumento,
  exigeElPoder,
  maxBytesDocumento,
  type EstadoSolicitud,
  type ObservacionSolicitud,
  type RequisitoSolicitud,
  type SolicitudPublica,
} from '@botonera/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/watermelon/floating-input';
import { cn } from '@/lib/utils';
import { api, fecha, fechaHora, fijarSolicitud, pesos } from './api';
import { Aviso, Pagina, Pasos, Tarjeta } from './comunes';

const pasoDeEstado: Record<EstadoSolicitud, number> = {
  borrador: 0, observada: 0, enviada: 1, en_revision: 1, aprobada: 2, pagada: 3, emitida: 3, rechazada: 1, vencida: 2,
};

const colorEstado: Record<EstadoSolicitud, string> = {
  borrador: 'bg-crema-200 text-verde-800',
  enviada: 'bg-azul-600/10 text-azul-600',
  en_revision: 'bg-azul-600/10 text-azul-600',
  observada: 'bg-aviso/12 text-aviso',
  aprobada: 'bg-ok/12 text-ok',
  pagada: 'bg-ok/12 text-ok',
  emitida: 'bg-ok/12 text-ok',
  rechazada: 'bg-destructive/10 text-destructive',
  vencida: 'bg-crema-300 text-muted-foreground',
};

const tamano = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function Observaciones({ lista }: { lista: ObservacionSolicitud[] }) {
  if (!lista.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {lista.map((o) => (
        <li key={o.id} className="flex items-start gap-1.5 text-sm text-aviso">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {o.texto}
        </li>
      ))}
    </ul>
  );
}

function Campo({ req, valor, error, onChange, observaciones }: {
  req: RequisitoSolicitud;
  valor: string;
  error?: string;
  onChange: (v: string) => void;
  observaciones: ObservacionSolicitud[];
}) {
  const etiqueta = `${req.etiqueta}${req.obligatorio ? '' : ' (opcional)'}`;
  const clase = cn('h-12 bg-white text-base focus:ring-3 focus:ring-rosa-600/20', (error || observaciones.length > 0) && 'border-aviso');
  let control: ReactNode;
  if (req.tipo === 'opcion') {
    control = (
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        {etiqueta}
        <select value={valor} onChange={(e) => onChange(e.target.value)} className={cn(clase, 'rounded-lg border px-3 text-foreground')}>
          <option value="">Elegí una opción</option>
          {req.opciones?.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
  } else if (req.tipo === 'fecha') {
    control = (
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        {etiqueta}
        <input type="date" value={valor} onChange={(e) => onChange(e.target.value)} className={cn(clase, 'rounded-lg border px-3 text-foreground')} />
      </label>
    );
  } else {
    control = (
      <FloatingInput
        label={etiqueta}
        inputMode={req.tipo === 'numero' || req.formato === 'dni-cuit' ? 'numeric' : undefined}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        labelClassName="bg-white"
        className={clase}
      />
    );
  }
  return (
    <div>
      {control}
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : req.ayuda && <p className="mt-1 text-xs text-muted-foreground">{req.ayuda}</p>}
      <Observaciones lista={observaciones} />
    </div>
  );
}

function Documento({ req, solicitud, onSubido, observaciones }: {
  req: RequisitoSolicitud;
  solicitud: SolicitudPublica;
  onSubido: (s: SolicitudPublica) => void;
  observaciones: ObservacionSolicitud[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const actual = solicitud.documentos.find((d) => d.requisito === req.clave);
  // Documentos que vencen (ej. VTV): la fecha se pide antes de subir y se puede corregir después.
  const [venceEn, setVenceEn] = useState(actual?.venceEn ?? '');
  const hoy = new Date().toISOString().slice(0, 10);
  const vencido = !!actual?.venceEn && actual.venceEn < hoy;

  async function corregirFecha(valor: string) {
    setVenceEn(valor);
    if (!actual || !valor) return;
    setError('');
    try {
      onSubido(await api.fijarVencimiento(req.clave, valor));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError('');
    if (req.venceEn && !venceEn) return setError('Primero indicá la fecha de vencimiento del documento.');
    if (archivo.size > maxBytesDocumento) return setError('El archivo supera los 10 MB.');
    if (archivo.type && !formatosDocumento[archivo.type]) return setError(`Subí un archivo ${Object.values(formatosDocumento).join(', ')}.`);
    setSubiendo(true);
    try {
      onSubido(await api.subirDocumento(req.clave, archivo, req.venceEn ? venceEn : undefined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className={cn('rounded-xl border p-4', observaciones.length ? 'border-aviso/60 bg-aviso/5' : 'border-border')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', actual ? 'bg-ok/12 text-ok' : 'bg-crema-200 text-verde-600')}>
          {actual ? <Check className="size-5" /> : <FileText className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {req.etiqueta}
            {!req.obligatorio && <span className="font-normal text-muted-foreground"> (opcional)</span>}
          </p>
          {actual ? (
            <p className="truncate text-sm text-muted-foreground">
              {actual.nombre} · {tamano(actual.bytes)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{req.ayuda ?? 'PDF, JPG o PNG, hasta 10 MB.'}</p>
          )}
          {req.venceEn && (
            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Vence el
              <input
                type="date"
                value={venceEn}
                onChange={(e) => corregirFecha(e.target.value)}
                className={cn('h-9 rounded-lg border px-2 text-foreground', vencido && 'border-destructive')}
              />
              {vencido && <span className="font-medium text-destructive">Vencido: subí uno vigente.</span>}
            </label>
          )}
        </div>
        <div className="flex gap-2">
          {actual && (
            <Button asChild variant="ghost" size="sm" className="rounded-lg">
              <a href={api.urlDocumento(actual.id)} target="_blank" rel="noreferrer">
                <Eye /> Ver
              </a>
            </Button>
          )}
          <Button variant={actual ? 'outline' : 'default'} size="sm" className="rounded-lg" disabled={subiendo} onClick={() => input.current?.click()}>
            {subiendo ? <Loader2 className="animate-spin" /> : <Upload />}
            {subiendo ? 'Subiendo…' : actual ? 'Reemplazar' : 'Subir'}
          </Button>
          <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={elegir} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <Observaciones lista={observaciones} />
    </div>
  );
}

function Formulario({ solicitud, setSolicitud }: { solicitud: SolicitudPublica; setSolicitud: (s: SolicitudPublica) => void }) {
  const [datos, setDatos] = useState<Record<string, string>>(solicitud.datos);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState<'ok' | 'guardando' | 'error'>('ok');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const abiertas = solicitud.observaciones.filter((o) => !o.resuelta);
  const deRequisito = (clave: string) => abiertas.filter((o) => o.requisito === clave);
  const generales = abiertas.filter((o) => !o.requisito);
  const campos = solicitud.tipo.requisitos.filter((r) => r.tipo !== 'documento');
  const documentos = solicitud.tipo.requisitos.filter((r) => r.tipo === 'documento' && (!r.soloPoder || exigeElPoder(datos)));
  const etiquetas = new Map(solicitud.tipo.requisitos.map((r) => [r.clave, r.etiqueta]));

  function cambiar(clave: string, valor: string) {
    const nuevos = { ...datos, [clave]: valor };
    setDatos(nuevos);
    setGuardado('guardando');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api.guardarDatos(nuevos);
        setErrores(r.errores);
        setSolicitud(r);
        setGuardado('ok');
      } catch {
        setGuardado('error');
      }
    }, 600);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function enviar() {
    setError('');
    setEnviando(true);
    try {
      setSolicitud(await api.enviar());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  const pendientes = solicitud.pendientes;
  const puedeEnviar = pendientes.length === 0 && guardado === 'ok' && !enviando;

  return (
    <Tarjeta k="formulario">
      {solicitud.estado === 'observada' ? (
        <div className="mb-6 rounded-xl bg-aviso/10 p-4 text-aviso">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-5" /> Los técnicos pidieron correcciones
          </p>
          <p className="mt-1 text-sm">Corregí lo marcado y volvé a enviar la solicitud.</p>
          <Observaciones lista={generales} />
        </div>
      ) : (
        <>
          <h2 className="text-xl font-medium text-verde-800">{solicitud.tipoSolicitud === 'renovacion' ? 'Revisá los datos de la renovación' : 'Completá los requisitos'}</h2>
          <p className="mt-1 mb-6 text-muted-foreground">
            {solicitud.tipoSolicitud === 'renovacion'
              ? 'Cargamos lo que ya teníamos. Si no cambió nada y tus documentos siguen vigentes, la renovación se aprueba sola; si cambiás algo, la revisan los técnicos.'
              : 'Lo que cargás se guarda solo. Podés seguir más tarde con tu enlace.'}
          </p>
        </>
      )}

      <h3 className="mb-3 font-medium text-verde-700">Datos</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {campos.map((r) => (
          <Campo key={r.clave} req={r} valor={datos[r.clave] ?? ''} error={errores[r.clave]} onChange={(v) => cambiar(r.clave, v)} observaciones={deRequisito(r.clave)} />
        ))}
      </div>

      <h3 className="mt-8 mb-3 font-medium text-verde-700">Documentos</h3>
      <div className="flex flex-col gap-3">
        {documentos.map((r) => (
          <Documento key={r.clave} req={r} solicitud={solicitud} onSubido={setSolicitud} observaciones={deRequisito(r.clave)} />
        ))}
      </div>

      <div className="mt-8 border-t border-border pt-6">
        {pendientes.length > 0 && (
          <p className="mb-4 text-sm text-muted-foreground">
            Para enviar falta: {pendientes.map((p) => etiquetas.get(p) ?? p).join(', ')}.
          </p>
        )}
        {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg" className="rounded-lg" disabled={!puedeEnviar} onClick={enviar}>
            {enviando && <Loader2 className="animate-spin" />}
            {solicitud.estado === 'observada' ? 'Reenviar con las correcciones' : solicitud.tipoSolicitud === 'renovacion' ? 'Enviar la renovación' : 'Enviar a revisión'}
          </Button>
          <span className={cn('text-sm', guardado === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {{ ok: 'Cambios guardados', guardando: 'Guardando…', error: 'No se pudo guardar. Revisá tu conexión.' }[guardado]}
          </span>
        </div>
      </div>
    </Tarjeta>
  );
}

/** Lo presentado, de solo lectura. */
function Resumen({ solicitud }: { solicitud: SolicitudPublica }) {
  return (
    <details className="mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <summary className="cursor-pointer font-medium text-verde-800">Lo que presentaste</summary>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {solicitud.tipo.requisitos.filter((r) => r.tipo !== 'documento').map((r) => (
          <div key={r.clave} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{r.etiqueta}</dt>
            <dd className="mt-0.5 break-words">{solicitud.datos[r.clave] || '—'}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-4 flex flex-col gap-2">
        {solicitud.documentos.map((d) => (
          <li key={d.id}>
            <a href={api.urlDocumento(d.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-verde-700 hover:underline">
              <FileText className="size-4" />
              {solicitud.tipo.requisitos.find((r) => r.clave === d.requisito)?.etiqueta}: {d.nombre}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Historial({ solicitud }: { solicitud: SolicitudPublica }) {
  return (
    <details className="mt-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <summary className="cursor-pointer font-medium text-verde-800">Historial</summary>
      <ol className="mt-4 flex flex-col gap-3 border-l-2 border-crema-300 pl-4">
        {solicitud.historial.map((h, i) => (
          <li key={i} className="text-sm">
            <span className="text-muted-foreground">{fechaHora(h.fecha)}</span> · <strong className="font-medium">{etiquetasEstado[h.estado]}</strong>
            {h.nota && <p className="text-muted-foreground">{h.nota}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Estado({ icono, tono, titulo, children }: { icono: ReactNode; tono: string; titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row">
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-full', tono)}>{icono}</span>
      <div>
        <h2 className="text-xl font-medium text-verde-800">{titulo}</h2>
        <div className="mt-1 flex flex-col gap-2 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/**
 * Token del enlace del mail (va en el fragmento `#`, que el navegador no manda al servidor ni en el
 * Referer). Se lee una vez y se borra de la URL y del historial enseguida.
 */
let tokenDeLaUrl = (() => {
  const t = window.location.hash.replace(/^#/, '');
  if (t) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : '';
})();

export default function Solicitud() {
  // Desde "Mis certificados" se llega con ?n=<número>: la sesión es de persona y se indica cuál solicitud abrir.
  const [params] = useSearchParams();
  const numeroDeLaUrl = params.get('n') ?? '';
  fijarSolicitud(numeroDeLaUrl);
  const [solicitud, setSolicitud] = useState<SolicitudPublica | null>(null);
  const [error, setError] = useState('');
  const [abriendo, setAbriendo] = useState(false);
  // Si llegó por el enlace de un mail, el token vino en el fragmento (#): todavía hay que canjearlo.
  const [porCanjear, setPorCanjear] = useState(tokenDeLaUrl !== '');

  useEffect(() => {
    // Sin enlace por canjear: se entra con la sesión (cookie) que ya tiene.
    if (!porCanjear) api.solicitud().then(setSolicitud, (e: Error) => setError(e.message));
  }, [porCanjear]);

  // El canje es un clic explícito (no al cargar la página): un escáner de mails que solo visite el
  // enlace no gasta el enlace de un solo uso. Es la única vez que el token viaja, en el cuerpo de un POST.
  async function abrir() {
    setAbriendo(true);
    try {
      await api.abrirSesion(tokenDeLaUrl);
      tokenDeLaUrl = '';
      setPorCanjear(false);
    } catch (e) {
      setError((e as Error).message);
    }
    setAbriendo(false);
  }

  if (error) {
    return (
      <Pagina titulo="No encontramos la solicitud">
        <Aviso>{error}</Aviso>
        <Button asChild className="mt-6 rounded-lg">
          <Link to="/pagar/fitosanitarios">Ir al inicio del trámite</Link>
        </Button>
      </Pagina>
    );
  }
  if (porCanjear && !solicitud) {
    return (
      <Pagina titulo="Tu solicitud de fitosanitarios" bajada="Por seguridad, el enlace de tu mail se usa una sola vez.">
        <Tarjeta k="canje">
          <p className="text-muted-foreground">Tocá el botón para entrar a tu solicitud. Si el enlace ya se usó o venció, podés pedir uno nuevo con tu mail.</p>
          <Button size="lg" className="mt-5 rounded-lg" disabled={abriendo} onClick={abrir}>
            {abriendo ? <Loader2 className="size-4 animate-spin" /> : null} Abrir mi solicitud
          </Button>
        </Tarjeta>
      </Pagina>
    );
  }
  if (!solicitud) {
    return (
      <Pagina titulo="Cargando tu solicitud…">
        <Loader2 className="size-6 animate-spin text-verde-600" />
      </Pagina>
    );
  }

  const s = solicitud;
  return (
    <Pagina
      titulo={s.tipoSolicitud === 'renovacion' ? `Renovación: ${s.tipo.nombre}` : s.tipo.nombre}
      bajada={
        <span className="flex flex-wrap items-center gap-2">
          Solicitud <strong className="text-foreground">{s.numero}</strong>
          <Badge className={cn('border-0', colorEstado[s.estado])}>{etiquetasEstado[s.estado]}</Badge>
        </span>
      }
    >
      <Pasos nombres={['Requisitos', 'Revisión', 'Pago', 'Certificado']} actual={pasoDeEstado[s.estado]} />

      <AnimatePresence mode="wait">
        {s.puedeEditar ? (
          <Formulario key={s.estado} solicitud={s} setSolicitud={setSolicitud} />
        ) : (
          <Tarjeta k={s.estado}>
            {(s.estado === 'enviada' || s.estado === 'en_revision') && (
              <Estado icono={<Hourglass className="size-6" />} tono="bg-azul-600/10 text-azul-600" titulo={s.estado === 'enviada' ? 'Recibimos tu solicitud' : 'Los técnicos la están revisando'}>
                <p>Te avisamos a <strong className="text-foreground">{s.email}</strong> cuando terminen la revisión: si está aprobada, si hay que corregir algo o si no puede aprobarse.</p>
                {s.enviadaEn && <p className="text-sm">Enviada el {fecha(s.enviadaEn)}.</p>}
              </Estado>
            )}
            {s.estado === 'aprobada' && (
              <Estado icono={<Check className="size-6" />} tono="bg-ok/12 text-ok" titulo="¡Solicitud aprobada!">
                <p>Ya podés pagar la tasa para que se emita el certificado.</p>
                {s.tipo.importeCentavos !== null && (
                  <p className="text-lg text-foreground">
                    Tasa: <strong className="text-verde-700">{pesos(s.tipo.importeCentavos)}</strong>
                  </p>
                )}
                {s.aprobacionVence && <p className="text-sm">La aprobación vale hasta el {fecha(s.aprobacionVence)}.</p>}
                <div className="mt-2">
                  <Button size="lg" className="rounded-lg" disabled>
                    Pagar la tasa
                  </Button>
                  <p className="mt-2 text-sm">El pago en línea se habilita con la integración de MacroClick.</p>
                </div>
              </Estado>
            )}
            {s.estado === 'rechazada' && (
              <Estado icono={<CircleX className="size-6" />} tono="bg-destructive/10 text-destructive" titulo="La solicitud fue rechazada">
                {s.motivoRechazo && <p className="text-foreground">Motivo: {s.motivoRechazo}</p>}
                <p>Si tenés dudas, comunicate con el Departamento de Control Ambiental. Podés iniciar una solicitud nueva cuando quieras.</p>
                <Button asChild variant="outline" className="mt-2 self-start rounded-lg">
                  <Link to="/pagar/fitosanitarios">Iniciar una solicitud nueva</Link>
                </Button>
              </Estado>
            )}
            {s.estado === 'vencida' && (
              <Estado icono={<Clock className="size-6" />} tono="bg-crema-200 text-muted-foreground" titulo="La aprobación venció">
                <p>Pasó el plazo para pagar sin que se hiciera el pago. Tenés que iniciar una solicitud nueva.</p>
                <Button asChild variant="outline" className="mt-2 self-start rounded-lg">
                  <Link to="/pagar/fitosanitarios">Iniciar una solicitud nueva</Link>
                </Button>
              </Estado>
            )}
            {(s.estado === 'pagada' || s.estado === 'emitida') && (
              <Estado icono={<Check className="size-6" />} tono="bg-ok/12 text-ok" titulo={s.estado === 'pagada' ? 'Pago recibido' : 'Certificado emitido'}>
                <p>Te enviamos el detalle por mail.</p>
              </Estado>
            )}
          </Tarjeta>
        )}
      </AnimatePresence>

      {!s.puedeEditar && <Resumen solicitud={s} />}
      <Historial solicitud={s} />
      {numeroDeLaUrl ? (
        <p className="mt-6 text-center text-sm">
          <Link to="/pagar/fitosanitarios/mis-certificados" className="text-verde-700 hover:underline">← Volver a mis certificados</Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Este enlace es personal: con él podés volver a tu solicitud. También te lo mandamos por mail.
        </p>
      )}
    </Pagina>
  );
}
