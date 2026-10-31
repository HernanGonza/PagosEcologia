// Inicio del trámite: elegir el tipo de certificado, verificar el mail y crear la solicitud.
// Desde ahí la persona sigue con su enlace privado (Solicitud.tsx).
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ChevronDown, FileText, MailCheck } from 'lucide-react';
import { etiquetasEstado, type TipoSolicitudPublico } from '@botonera/shared';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/watermelon/floating-input';
import { cn } from '@/lib/utils';
import { api, ErrorApi, fechaHora, pesos, type SolicitudExistente } from './api';
import { Aviso, Kicker, Pagina, Pasos, Tarjeta } from './comunes';

type Paso = 'tipo' | 'mail' | 'codigo' | 'existentes';

const inputClase = 'h-12 bg-white text-base focus:ring-3 focus:ring-rosa-600/20';

function TarjetaTipo({ tipo, elegir }: { tipo: TipoSolicitudPublico; elegir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const documentos = tipo.requisitos.filter((r) => r.tipo === 'documento');
  return (
    <motion.div layout className="flex flex-col rounded-2xl border border-border bg-white p-5 transition-colors hover:border-verde-500">
      <h3 className="text-lg font-medium text-verde-800">{tipo.nombre}</h3>
      {tipo.descripcion && <p className="mt-1 text-sm text-muted-foreground">{tipo.descripcion}</p>}
      <p className="mt-3 text-sm">
        {tipo.importeCentavos !== null ? (
          <>
            Tasa: <strong className="text-verde-700">{pesos(tipo.importeCentavos)}</strong>
          </>
        ) : (
          <span className="text-muted-foreground">La tasa se informa al aprobarse la solicitud.</span>
        )}
      </p>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="mt-3 inline-flex items-center gap-1 self-start text-sm font-medium text-rosa-600 hover:underline"
      >
        {documentos.length} documentos para presentar
        <ChevronDown className={cn('size-4 transition-transform', abierto && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 flex flex-col gap-1.5 overflow-hidden text-sm"
          >
            {documentos.map((d) => (
              <li key={d.clave} className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-verde-600" />
                {d.etiqueta}
                {!d.obligatorio && <span className="text-muted-foreground">(opcional)</span>}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      <Button className="mt-5 rounded-lg" onClick={elegir}>
        Iniciar solicitud
      </Button>
    </motion.div>
  );
}

/** Por qué se llegó acá sin sesión: enlace vencido o reemplazado, o enlace que ya se usó (y cuándo). */
function AvisoEnlace() {
  const q = new URLSearchParams(window.location.search);
  const motivo = q.get('enlace');
  if (motivo === 'usado') {
    const cuando = q.get('cuando');
    return (
      <div className="mt-8">
        <Aviso>
          Este enlace ya se usó{cuando && !Number.isNaN(Date.parse(cuando)) ? ` el ${fechaHora(cuando)}` : ''}; los enlaces valen una sola vez. Si fuiste vos, pedí un enlace nuevo con tu mail acá abajo. Si no fuiste vos, pedí igual uno nuevo (cierra la sesión anterior) y avisanos.
        </Aviso>
      </div>
    );
  }
  if (motivo === 'vencido') {
    return (
      <div className="mt-8">
        <Aviso>Tu sesión venció o el enlace ya no vale (se usa una sola vez, vence y lo reemplaza uno más nuevo). Pedí uno nuevo con tu mail acá abajo.</Aviso>
      </div>
    );
  }
  return null;
}

function Recuperar() {
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [paso, setPaso] = useState<'mail' | 'codigo' | 'listo'>('mail');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  async function pedir(e?: FormEvent) {
    e?.preventDefault();
    setOcupado(true);
    setError('');
    try {
      await api.pedirCodigo(email, 'recuperar');
      setPaso('codigo');
    } catch (err) {
      setError((err as Error).message);
    }
    setOcupado(false);
  }
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      await api.recuperar(email, codigo.trim());
      setPaso('listo');
    } catch (err) {
      setError((err as Error).message);
    }
    setOcupado(false);
  }
  return (
    <section className="mt-10 rounded-2xl border border-dashed border-border p-5 sm:p-6">
      <h2 className="font-medium text-verde-800">¿Ya iniciaste una solicitud?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Te mandamos un código para confirmar que el mail es tuyo y, con él, un enlace nuevo a tus solicitudes. Es de un solo uso y reemplaza a los anteriores.
      </p>
      {paso === 'listo' ? (
        <div className="mt-4">
          <Aviso tono="ok">Si hay solicitudes con ese mail, en unos minutos te llega el enlace nuevo.</Aviso>
        </div>
      ) : paso === 'mail' ? (
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={pedir}>
          <div className="flex-1">
            <FloatingInput label="Tu mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} labelClassName="bg-crema" className={cn(inputClase, 'bg-transparent')} />
          </div>
          <Button type="submit" variant="outline" size="lg" className="h-12 rounded-lg" disabled={ocupado}>
            Enviar código
          </Button>
        </form>
      ) : (
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={enviar}>
          <div className="flex-1">
            <FloatingInput
              label={`Código que enviamos a ${email}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              labelClassName="bg-crema"
              className={cn(inputClase, 'bg-transparent')}
            />
          </div>
          <Button type="submit" variant="outline" size="lg" className="h-12 rounded-lg" disabled={ocupado || codigo.length !== 6}>
            Reenviar enlaces
          </Button>
        </form>
      )}
      {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
    </section>
  );
}

export default function Fitosanitarios() {
  const navigate = useNavigate();
  const [tipos, setTipos] = useState<TipoSolicitudPublico[] | null>(null);
  const [errorTipos, setErrorTipos] = useState('');
  const [paso, setPaso] = useState<Paso>('tipo');
  const [tipo, setTipo] = useState<TipoSolicitudPublico | null>(null);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [existentes, setExistentes] = useState<SolicitudExistente[]>([]);

  useEffect(() => {
    api.tipos().then(setTipos, (e: Error) => setErrorTipos(e.message));
  }, []);

  async function pedirCodigo(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    setOcupado(true);
    try {
      await api.pedirCodigo(email);
      setCodigo('');
      setPaso('codigo');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function crear(e?: FormEvent, nueva = false) {
    e?.preventDefault();
    if (!tipo) return;
    setError('');
    setOcupado(true);
    try {
      const r = await api.crear(email, codigo.trim(), tipo.slug, nueva);
      if ('existentes' in r) {
        setExistentes(r.existentes);
        setPaso('existentes');
        setOcupado(false);
        return;
      }
      navigate('/pagar/fitosanitarios/solicitud', { replace: true });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No pudimos crear la solicitud.');
      setOcupado(false);
    }
  }

  async function continuar(numero: string) {
    setOcupado(true);
    setError('');
    try {
      await api.continuar(email, codigo.trim(), numero);
      navigate('/pagar/fitosanitarios/solicitud');
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No pudimos abrir la solicitud.');
      setOcupado(false);
    }
  }

  const indice = paso === 'tipo' ? 0 : 1;

  return (
    <Pagina
      titulo="Certificado de fitosanitarios y domisanitarios"
      bajada="Presentá la solicitud en línea. Los técnicos del área la revisan y, cuando la aprueban, te avisamos por mail para que hagas el pago."
    >
      <Pasos nombres={['Tipo de certificado', 'Tu mail', 'Requisitos', 'Revisión y pago']} actual={indice} />

      <AnimatePresence mode="wait">
        {paso === 'tipo' && (
          <motion.div key="tipo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2 className="mb-1 text-xl font-medium text-verde-800">¿Qué querés habilitar?</h2>
            <p className="mb-5 text-muted-foreground">Cada tipo pide sus propios datos y documentos. Tené a mano los archivos en PDF, JPG o PNG.</p>
            {errorTipos && <Aviso>{errorTipos}</Aviso>}
            {!tipos && !errorTipos && <p className="text-muted-foreground">Cargando…</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              {tipos?.map((t) => (
                <TarjetaTipo
                  key={t.slug}
                  tipo={t}
                  elegir={() => {
                    setTipo(t);
                    setPaso('mail');
                  }}
                />
              ))}
            </div>
            <AvisoEnlace />
            <section className="mt-10 flex flex-col gap-3 rounded-2xl border border-verde-500/40 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="font-medium text-verde-800">¿Ya tenés certificados?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Mirá sus vencimientos, descargalos y renová uno o varios a la vez.</p>
              </div>
              <Button asChild size="lg" className="rounded-lg">
                <Link to="/pagar/fitosanitarios/mis-certificados">Mis certificados <ArrowRight className="size-4" /></Link>
              </Button>
            </section>
            <Recuperar />
          </motion.div>
        )}

        {paso === 'mail' && tipo && (
          <Tarjeta k="mail">
            <Kicker>{tipo.nombre}</Kicker>
            <h2 className="mt-1 text-xl font-medium text-verde-800">¿A qué mail te avisamos?</h2>
            <p className="mt-1 text-muted-foreground">
              No hace falta crear una cuenta. Te mandamos un código para confirmar que el mail es tuyo; ahí te van a llegar las novedades y el enlace para seguir la solicitud.
            </p>
            <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={pedirCodigo}>
              <div className="flex-1">
                <FloatingInput label="Mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} labelClassName="bg-white" className={inputClase} />
              </div>
              <Button type="submit" size="lg" className="h-12 rounded-lg px-6" disabled={ocupado}>
                Enviar código
              </Button>
            </form>
            {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
            <Button variant="link" className="mt-4 px-0 text-verde-700" onClick={() => setPaso('tipo')}>
              Elegir otro tipo
            </Button>
          </Tarjeta>
        )}

        {paso === 'codigo' && tipo && (
          <Tarjeta k="codigo">
            <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-crema-200 text-verde-600">
              <MailCheck className="size-6" />
            </span>
            <h2 className="text-xl font-medium text-verde-800">Revisá tu mail</h2>
            <p className="mt-1 text-muted-foreground">
              Te mandamos un código de 6 números a <strong className="text-foreground">{email}</strong>. Vence en 15 minutos. Si no lo ves, buscá en spam.
            </p>
            <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={crear}>
              <div className="flex-1">
                <FloatingInput
                  label="Código"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                  labelClassName="bg-white"
                  className={cn(inputClase, 'tracking-[0.4em]')}
                />
              </div>
              <Button type="submit" size="lg" className="h-12 rounded-lg px-6" disabled={ocupado || codigo.length !== 6}>
                Verificar y empezar
              </Button>
            </form>
            {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
            <div className="mt-4 flex flex-wrap gap-x-4">
              <Button variant="link" className="px-0 text-verde-700" onClick={() => pedirCodigo()} disabled={ocupado}>
                Mandar otro código
              </Button>
              <Button variant="link" className="px-0 text-verde-700" onClick={() => setPaso('mail')}>
                Cambiar el mail
              </Button>
            </div>
          </Tarjeta>
        )}

        {paso === 'existentes' && tipo && (
          <Tarjeta k="existentes">
            <Kicker>Mail verificado</Kicker>
            <h2 className="mt-1 text-xl font-medium text-verde-800">
              {existentes.length === 1 ? 'Ya tenés una solicitud en curso' : `Ya tenés ${existentes.length} solicitudes en curso`}
            </h2>
            <p className="mt-1 text-muted-foreground">
              Antes de empezar otra, fijate si es alguna de estas. Podés seguirla desde donde la dejaste.
            </p>
            <ul className="mt-5 flex flex-col gap-3">
              {existentes.map((x) => (
                <li key={x.numero} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-verde-800">{x.tipoNombre}</p>
                    <p className="text-sm text-muted-foreground">
                      {x.numero} · {etiquetasEstado[x.estado]} · {fechaHora(x.actualizadaEn)}
                    </p>
                  </div>
                  <Button className="rounded-lg" disabled={ocupado} onClick={() => continuar(x.numero)}>
                    Continuar <ArrowRight className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">¿Es un trámite distinto? Podés iniciar una solicitud nueva de «{tipo.nombre}».</p>
              <Button variant="outline" className="mt-3 rounded-lg" disabled={ocupado} onClick={() => crear(undefined, true)}>
                Iniciar una solicitud nueva
              </Button>
            </div>
          </Tarjeta>
        )}
      </AnimatePresence>
    </Pagina>
  );
}
