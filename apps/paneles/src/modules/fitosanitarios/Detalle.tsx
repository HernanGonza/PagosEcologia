import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FileText, Hand, ImageIcon, Loader2, MessageSquareWarning, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { PersonaRevision, RequisitoSolicitud, SolicitudPanel } from '@botonera/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { avisoError, avisoExito, cargando, confirmar } from '@/lib/alertas';
import { cn } from '@/lib/utils';
import { usePendientes } from '../../pendientes';
import { api } from '../../sesion';
import { EstadoBadge, RUTA, fecha, fechaHora } from './comunes';

type Accion = 'aprobar' | 'observar' | 'rechazar';

const actores = { solicitante: 'Solicitante', tecnico: 'Técnico', sistema: 'Sistema' } as const;

const tamano = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export default function Detalle() {
  const { id } = useParams();
  const [s, setS] = useState<SolicitudPanel | null>(null);
  const [error, setError] = useState('');
  const [dialogo, setDialogo] = useState<Accion | null>(null);
  const [tomando, setTomando] = useState(false);
  const { refrescar } = usePendientes();

  const cargar = useCallback(() => {
    api<SolicitudPanel>(`${RUTA}/solicitudes/${id}`)
      .then((r) => (setS(r), setError('')))
      .catch((e) => setError(e.message));
    refrescar();
  }, [id, refrescar]);
  useEffect(cargar, [cargar]);

  // Documentos en el orden de los requisitos; las versiones reemplazadas van después de la vigente.
  const docs = useMemo(() => {
    if (!s) return [];
    const orden = new Map(s.tipo.requisitos.map((r, i) => [r.clave, i]));
    return [...s.documentos].sort((a, b) => (orden.get(a.requisito) ?? 99) - (orden.get(b.requisito) ?? 99) || Number(a.reemplazado) - Number(b.reemplazado));
  }, [s]);
  const [visor, setVisor] = useState<number | null>(null);
  const abrir = (docId: number) => setVisor(docs.findIndex((d) => d.id === docId));

  async function tomar() {
    const ok = await confirmar({
      titulo: '¿Tomar la revisión?',
      texto: `La solicitud ${s!.numero} queda a tu nombre y los demás técnicos ven que la estás revisando.`,
      boton: 'Tomarla',
      icono: 'info',
    });
    if (!ok) return;
    setTomando(true);
    try {
      await api(`${RUTA}/solicitudes/${id}/tomar`, { method: 'POST' });
      avisoExito('La solicitud quedó a tu nombre');
      cargar();
    } catch (e) {
      avisoError('No se pudo tomar la solicitud', (e as Error).message);
      cargar();
    } finally {
      setTomando(false);
    }
  }

  if (!s) {
    return error ? (
      <Volver>
        <p className="rounded-xl bg-destructive/8 px-4 py-3 text-destructive">{error}</p>
      </Volver>
    ) : (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const abiertas = s.observaciones.filter((o) => !o.resuelta);
  const generales = s.observaciones.filter((o) => !o.requisito);

  return (
    <Volver>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-medium tabular-nums text-verde-800">{s.numero}</h1>
            <EstadoBadge estado={s.estado} />
          </div>
          <p className="mt-1 text-muted-foreground">
            {s.tipo.nombre} · enviada el {fecha(s.enviadaEn)} · {s.email}
          </p>
        </div>
        {s.acciones.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {s.acciones.includes('tomar') && (
              <Button variant="outline" onClick={tomar} disabled={tomando}>
                {tomando ? <Loader2 className="animate-spin" /> : <Hand />} Tomar la revisión
              </Button>
            )}
            {s.acciones.includes('observar') && (
              <Button variant="outline" onClick={() => setDialogo('observar')}>
                <MessageSquareWarning /> Observar
              </Button>
            )}
            {s.acciones.includes('rechazar') && (
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDialogo('rechazar')}>
                <X /> Rechazar
              </Button>
            )}
            {s.acciones.includes('aprobar') && (
              <Button onClick={() => setDialogo('aprobar')}>
                <Check /> Aprobar
              </Button>
            )}
          </div>
        )}
      </div>

      {error && <p className="mb-4 rounded-xl bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p>}
      <Situacion s={s} abiertas={abiertas.length} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-2xl border border-border bg-white">
          <h2 className="border-b border-border px-6 py-4 font-medium">Requisitos presentados</h2>
          <ul className="divide-y divide-border">
            {s.tipo.requisitos.map((r) => (
              <Requisito key={r.clave} r={r} s={s} onAbrir={abrir} />
            ))}
          </ul>
        </section>

        <aside className="flex flex-col gap-6">
          <Revision s={s} />
          {generales.length > 0 && (
            <section className="rounded-2xl border border-border bg-white p-5">
              <h2 className="mb-3 font-medium">Observaciones generales</h2>
              <ul className="flex flex-col gap-3">
                {generales.map((o) => (
                  <Observacion key={o.id} texto={o.texto} autor={o.autor} fecha={o.creadaEn} resuelta={o.resuelta} />
                ))}
              </ul>
            </section>
          )}
          <section className="rounded-2xl border border-border bg-white p-5">
            <h2 className="mb-3 font-medium">Historial</h2>
            <ol className="flex flex-col gap-4 border-l border-border pl-4">
              {s.historial.map((h, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-verde-500" />
                  <EstadoBadge estado={h.estado} />
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fechaHora(h.fecha)} · {h.actorNombre ?? actores[h.actor]}
                  </div>
                  {h.actorEmail && <div className="text-xs text-muted-foreground">{h.actorEmail}</div>}
                  {h.nota && <p className="mt-1 text-sm whitespace-pre-line">{h.nota}</p>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <VisorDocumento
        docs={docs}
        indice={visor}
        requisitos={s.tipo.requisitos}
        onCambiar={setVisor}
        onCerrar={() => setVisor(null)}
        onVencido={cargar}
      />
      <DialogoAccion
        accion={dialogo}
        s={s}
        onCerrar={() => setDialogo(null)}
        onHecho={() => {
          setDialogo(null);
          cargar();
        }}
      />
    </Volver>
  );
}

function Volver({ children }: { children: ReactNode }) {
  return (
    <div>
      <Link to=".." relative="path" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Volver a las solicitudes
      </Link>
      {children}
    </div>
  );
}

/** Una línea que explica en qué está la solicitud y qué sigue. */
function Situacion({ s, abiertas }: { s: SolicitudPanel; abiertas: number }) {
  let texto: string | null = null;
  if (s.estado === 'en_revision') texto = `La está revisando ${s.revisorNombre ?? 'un técnico'} desde el ${s.tomada ? fechaHora(s.tomada.fecha) : '—'}`;
  if (s.estado === 'observada') texto = `Espera que la persona corrija ${abiertas === 1 ? '1 observación' : `${abiertas} observaciones`}. Cuando la reenvíe vuelve a Pendientes.`;
  if (s.estado === 'aprobada') texto = `Aprobada por ${s.resuelta?.nombre ?? 'un técnico'}. La persona tiene hasta el ${fecha(s.aprobacionVence)} para pagar la tasa.`;
  if (s.estado === 'rechazada') texto = `Rechazada. Motivo: ${s.motivoRechazo ?? '—'}`;
  if (s.estado === 'vencida') texto = 'La aprobación venció sin que se pagara la tasa.';
  if (!texto) return null;
  return <p className="mb-6 rounded-xl bg-crema-200 px-4 py-3 text-sm text-verde-900">{texto}</p>;
}

/** Quién la tomó y quién la resolvió, con fecha y hora. El paso a paso completo está en el historial. */
function Revision({ s }: { s: SolicitudPanel }) {
  const resolucion = s.estado === 'rechazada' ? 'Rechazada por' : 'Aprobada por';
  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <h2 className="mb-3 font-medium">Revisión</h2>
      <dl className="flex flex-col gap-3 text-sm">
        <Persona titulo="Enviada" p={s.enviadaEn ? { nombre: null, email: s.email, fecha: s.enviadaEn } : null} vacio="Todavía no se envió" />
        <Persona titulo="Tomada por" p={s.tomada} vacio="Nadie la tomó todavía" />
        {(s.resuelta || ['aprobada', 'rechazada', 'pagada', 'emitida', 'vencida'].includes(s.estado)) && (
          <Persona titulo={resolucion} p={s.resuelta} vacio="—" />
        )}
      </dl>
    </section>
  );
}

function Persona({ titulo, p, vacio }: { titulo: string; p: PersonaRevision | null; vacio: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</dt>
      {p ? (
        <dd className="mt-0.5">
          {p.nombre && <div className="font-medium">{p.nombre}</div>}
          {p.email && <div className={p.nombre ? 'text-xs text-muted-foreground' : ''}>{p.email}</div>}
          <div className="text-xs text-muted-foreground">{fechaHora(p.fecha)}</div>
        </dd>
      ) : (
        <dd className="mt-0.5 text-muted-foreground">{vacio}</dd>
      )}
    </div>
  );
}

function Requisito({ r, s, onAbrir }: { r: RequisitoSolicitud; s: SolicitudPanel; onAbrir: (id: number) => void }) {
  const obs = s.observaciones.filter((o) => o.requisito === r.clave);
  const abierta = obs.some((o) => !o.resuelta);
  const docs = s.documentos.filter((d) => d.requisito === r.clave);
  const vigente = docs.find((d) => !d.reemplazado);
  const anteriores = docs.filter((d) => d.reemplazado);

  return (
    <li className={cn('px-6 py-4', abierta && 'bg-rosa-600/5')}>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{r.etiqueta}</div>
      {r.tipo === 'documento' ? (
        vigente ? (
          <Archivo d={vigente} onAbrir={onAbrir} />
        ) : (
          <p className="mt-1 text-muted-foreground">{r.obligatorio ? 'Falta el documento' : 'No presentó'}</p>
        )
      ) : (
        <p className="mt-1 break-words">{s.datos[r.clave] || <span className="text-muted-foreground">—</span>}</p>
      )}
      {anteriores.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Versiones anteriores ({anteriores.length})</summary>
          <div className="mt-1 opacity-70">
            {anteriores.map((d) => (
              <Archivo key={d.id} d={d} onAbrir={onAbrir} />
            ))}
          </div>
        </details>
      )}
      {obs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {obs.map((o) => (
            <Observacion key={o.id} texto={o.texto} autor={o.autor} fecha={o.creadaEn} resuelta={o.resuelta} />
          ))}
        </ul>
      )}
    </li>
  );
}

type Doc = SolicitudPanel['documentos'][number];

function Archivo({ d, onAbrir }: { d: Doc; onAbrir: (id: number) => void }) {
  const Icono = d.tipoMime.startsWith('image/') ? ImageIcon : FileText;
  return (
    <button
      type="button"
      onClick={() => onAbrir(d.id)}
      className="mt-1 inline-flex max-w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left text-sm transition-colors hover:border-verde-500 hover:bg-crema/50"
    >
      <Icono className="size-4 shrink-0 text-verde-600" />
      <span className="truncate">{d.nombre}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {tamano(d.bytes)} · {fecha(d.subidoEn)}
      </span>
    </button>
  );
}

/**
 * Visor de documentos: se ven dentro del panel, sin abrir pestañas. El archivo se baja con el
 * enlace firmado (dura 10 minutos); si venció, se recarga la solicitud para pedir enlaces nuevos.
 */
function VisorDocumento({ docs, indice, requisitos, onCambiar, onCerrar, onVencido }: {
  docs: Doc[];
  indice: number | null;
  requisitos: RequisitoSolicitud[];
  onCambiar: (i: number) => void;
  onCerrar: () => void;
  onVencido: () => void;
}) {
  const d = indice === null ? null : docs[indice];
  const [archivo, setArchivo] = useState<{ id: number; url: string } | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(false);
  const renovados = useRef(new Set<number>());

  useEffect(() => {
    if (!d) return;
    let vigente = true;
    let url: string | null = null;
    setArchivo(null);
    setError('');
    setZoom(false);
    fetch(d.url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((blob) => {
        // El blob se tipa con lo que validó la API al subirlo, para que el navegador lo muestre bien.
        url = URL.createObjectURL(new Blob([blob], { type: d.tipoMime }));
        if (vigente) setArchivo({ id: d.id, url });
      })
      .catch(() => {
        if (!vigente) return;
        // Una sola renovación por documento: si vuelve a fallar, no es el vencimiento del enlace.
        if (!renovados.current.has(d.id)) {
          renovados.current.add(d.id);
          setError('El enlace del documento venció. Lo estamos renovando…');
          onVencido();
        } else {
          setError('No se pudo cargar el documento. Probá de nuevo en unos minutos.');
        }
      });
    return () => {
      vigente = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [d?.id, d?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flechas del teclado para pasar de documento.
  useEffect(() => {
    if (indice === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && indice < docs.length - 1) onCambiar(indice + 1);
      if (e.key === 'ArrowLeft' && indice > 0) onCambiar(indice - 1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [indice, docs.length, onCambiar]);

  if (!d || indice === null) return null;
  const etiqueta = requisitos.find((r) => r.clave === d.requisito)?.etiqueta ?? d.requisito;
  const esImagen = d.tipoMime.startsWith('image/');
  const listo = archivo?.id === d.id ? archivo.url : null;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent showCloseButton={false} className="flex h-[92svh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-3 text-left sm:px-5">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{etiqueta}</DialogTitle>
            <DialogDescription className="truncate text-xs">
              {d.nombre} · {tamano(d.bytes)} · subido el {fecha(d.subidoEn)}
              {d.reemplazado && ' · versión anterior (reemplazada)'}
            </DialogDescription>
          </div>
          <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
            {indice + 1} de {docs.length}
          </span>
          {esImagen && listo && (
            <Button variant="ghost" size="icon" onClick={() => setZoom((z) => !z)} aria-label={zoom ? 'Ajustar a la pantalla' : 'Ver en tamaño real'} title={zoom ? 'Ajustar a la pantalla' : 'Ver en tamaño real'}>
              {zoom ? <ZoomOut /> : <ZoomIn />}
            </Button>
          )}
          {listo && (
            <Button variant="ghost" size="icon" asChild>
              <a href={listo} download={d.nombre} aria-label="Descargar" title="Descargar">
                <Download />
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)">
            <X />
          </Button>
        </DialogHeader>

        <div className={cn('relative min-h-0 flex-1 bg-crema-200/60', esImagen && zoom ? 'overflow-auto' : 'overflow-hidden')}>
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>{error}</p>
            </div>
          ) : !listo ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : esImagen ? (
            <div className={cn('flex min-h-full items-center justify-center p-4', zoom && 'items-start justify-start')}>
              <img
                src={listo}
                alt={etiqueta}
                onClick={() => setZoom((z) => !z)}
                className={cn('rounded-lg bg-white shadow-sm', zoom ? 'max-w-none cursor-zoom-out' : 'max-h-[calc(92svh-8rem)] max-w-full cursor-zoom-in object-contain')}
              />
            </div>
          ) : (
            <iframe src={listo} title={etiqueta} className="h-full w-full border-0 bg-white" />
          )}
        </div>

        {docs.length > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 sm:px-5">
            <Button variant="outline" size="sm" disabled={indice === 0} onClick={() => onCambiar(indice - 1)}>
              <ChevronLeft /> Anterior
            </Button>
            <span className="truncate text-xs text-muted-foreground">
              {indice < docs.length - 1 ? `Sigue: ${requisitos.find((r) => r.clave === docs[indice + 1].requisito)?.etiqueta ?? ''}` : 'Último documento'}
            </span>
            <Button variant="outline" size="sm" disabled={indice === docs.length - 1} onClick={() => onCambiar(indice + 1)}>
              Siguiente <ChevronRight />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Observacion({ texto, autor, fecha: creada, resuelta }: { texto: string; autor: string | null; fecha: string; resuelta: boolean }) {
  return (
    <li className={cn('rounded-lg border px-3 py-2 text-sm', resuelta ? 'border-border text-muted-foreground' : 'border-rosa-300 bg-white')}>
      <p className="whitespace-pre-line">{texto}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {autor ?? 'Técnico'} · {fechaHora(creada)} · {resuelta ? 'Corregida' : 'Sin corregir'}
      </p>
    </li>
  );
}

const textos: Record<Accion, { titulo: string; descripcion: string; boton: string }> = {
  aprobar: {
    titulo: 'Aprobar la solicitud',
    descripcion: 'Le llega un mail a la persona para que pague la tasa. Podés dejar una nota que va a ver en el mail.',
    boton: 'Aprobar',
  },
  observar: {
    titulo: 'Pedir correcciones',
    descripcion: 'Marcá qué requisitos tiene que corregir y explicá qué falta. Le llega un mail con el enlace para corregir.',
    boton: 'Enviar observaciones',
  },
  rechazar: {
    titulo: 'Rechazar la solicitud',
    descripcion: 'La solicitud se cierra y no se puede corregir. Explicá el motivo: la persona lo recibe por mail.',
    boton: 'Rechazar',
  },
};

const exitos: Record<Accion, string> = {
  aprobar: 'Solicitud aprobada. Se avisó por mail.',
  observar: 'Observaciones enviadas. Se avisó por mail.',
  rechazar: 'Solicitud rechazada. Se avisó por mail.',
};

function DialogoAccion({ accion, s, onCerrar, onHecho }: { accion: Accion | null; s: SolicitudPanel; onCerrar: () => void; onHecho: () => void }) {
  const [texto, setTexto] = useState('');
  const [porRequisito, setPorRequisito] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // Mientras se confirma con SweetAlert el diálogo se oculta, pero lo escrito se conserva.
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    setTexto('');
    setPorRequisito({});
    setError('');
    setPausado(false);
  }, [accion]);

  if (!accion) return null;
  const t = textos[accion];

  async function enviar() {
    let body: unknown;
    let pregunta: Parameters<typeof confirmar>[0];
    if (accion === 'aprobar') {
      body = { nota: texto };
      pregunta = {
        titulo: '¿Aprobar la solicitud?',
        texto: `${s.numero}: le llega un mail a ${s.email} para que pague la tasa.`,
        boton: 'Sí, aprobar',
        icono: 'question',
      };
    } else if (accion === 'rechazar') {
      if (!texto.trim()) return setError('Escribí el motivo del rechazo.');
      body = { motivo: texto };
      pregunta = {
        titulo: '¿Rechazar la solicitud?',
        texto: `No se puede deshacer: la ${s.numero} se cierra y ${s.email} recibe el motivo por mail.`,
        boton: 'Sí, rechazar',
        peligro: true,
      };
    } else {
      const marcadas = Object.entries(porRequisito);
      if (marcadas.some(([, v]) => !v.trim())) return setError('Explicá qué hay que corregir en cada requisito marcado.');
      const observaciones = [...marcadas.map(([requisito, v]) => ({ requisito, texto: v })), ...(texto.trim() ? [{ texto }] : [])];
      if (!observaciones.length) return setError('Marcá al menos un requisito o escribí una observación general.');
      body = { observaciones };
      pregunta = {
        titulo: `¿Enviar ${observaciones.length === 1 ? 'la observación' : `${observaciones.length} observaciones`}?`,
        texto: `La ${s.numero} vuelve a ${s.email} para que corrija lo marcado. Le llega un mail con el enlace.`,
        boton: 'Sí, enviar',
        icono: 'question',
      };
    }

    setError('');
    setPausado(true);
    if (!(await confirmar(pregunta))) return setPausado(false);

    setOcupado(true);
    cargando('Guardando y avisando por mail…');
    try {
      await api(`${RUTA}/solicitudes/${s.id}/${accion}`, { method: 'POST', body: JSON.stringify(body) });
      avisoExito(exitos[accion!]);
      onHecho();
    } catch (e) {
      await avisoError('No se pudo completar la acción', (e as Error).message);
      setPausado(false);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={!pausado} onOpenChange={(abierto) => !abierto && !ocupado && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.titulo}</DialogTitle>
          <DialogDescription>{t.descripcion}</DialogDescription>
        </DialogHeader>

        {accion === 'observar' && (
          <ul className="flex flex-col gap-2">
            {s.tipo.requisitos.map((r) => {
              const marcado = r.clave in porRequisito;
              return (
                <li key={r.clave} className={cn('rounded-lg border px-3 py-2', marcado ? 'border-rosa-300' : 'border-border')}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-rosa-600"
                      checked={marcado}
                      onChange={(e) =>
                        setPorRequisito(({ [r.clave]: _, ...resto }) => (e.target.checked ? { ...resto, [r.clave]: '' } : resto))
                      }
                    />
                    {r.etiqueta}
                  </label>
                  {marcado && (
                    <Textarea
                      autoFocus
                      className="mt-2 min-h-16"
                      placeholder="Qué tiene que corregir"
                      value={porRequisito[r.clave]}
                      onChange={(e) => setPorRequisito((p) => ({ ...p, [r.clave]: e.target.value }))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="texto-accion">
            {accion === 'aprobar' ? 'Nota (opcional)' : accion === 'rechazar' ? 'Motivo del rechazo' : 'Observación general (opcional)'}
          </Label>
          <Textarea id="texto-accion" className="min-h-24" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variant={accion === 'rechazar' ? 'destructive' : 'default'} onClick={enviar} disabled={ocupado}>
            {ocupado && <Loader2 className="animate-spin" />} {t.boton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
