import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, Printer } from 'lucide-react';
import logo from '@botonera/marca/logos/ecologia-misiones-horizontal.svg';
import flor from '@botonera/marca/logos/flor-lapacho.svg';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/watermelon/floating-input';
import { cn } from '@/lib/utils';
import Marco from '../../components/Marco';
import { buscarCertificado, normalizarIdentificador, PRECIO_DEMO, type Certificado } from './demo';

type Paso = 'buscar' | 'pagar' | 'certificado';
const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const fecha = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-AR');

const pasos: { id: Paso; nombre: string }[] = [
  { id: 'buscar', nombre: 'Identificación' },
  { id: 'pagar', nombre: 'Renovación' },
  { id: 'certificado', nombre: 'Certificado' },
];

function Pasos({ actual }: { actual: Paso }) {
  const indice = pasos.findIndex((p) => p.id === actual);
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2 print:hidden" aria-label="Pasos del trámite">
      {pasos.map((p, i) => (
        <li
          key={p.id}
          aria-current={i === indice ? 'step' : undefined}
          className={cn(
            'flex flex-col gap-2 border-b-2 pb-3 text-xs sm:flex-row sm:items-center sm:text-sm',
            i <= indice ? 'border-verde-600 text-verde-700' : 'border-border text-muted-foreground',
            i === indice && 'font-semibold',
          )}
        >
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              i < indice ? 'bg-verde-600 text-white' : i === indice ? 'bg-rosa-600 text-white' : 'bg-crema-200 text-muted-foreground',
            )}
          >
            {i < indice ? <Check className="size-4" /> : i + 1}
          </span>
          {p.nombre}
        </li>
      ))}
    </ol>
  );
}

/** Tarjeta de cada paso, con transición al cambiar. */
function Tarjeta({ children, k }: { children: ReactNode; k: string }) {
  return (
    <motion.section
      key={k}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_2px_rgba(33,19,13,0.06),0_12px_34px_rgba(33,19,13,0.05)] sm:p-8 print:border-0 print:p-0 print:shadow-none"
    >
      {children}
    </motion.section>
  );
}

const Kicker = ({ children }: { children: ReactNode }) => (
  <span className="text-xs font-semibold tracking-[0.1em] text-rosa-600 uppercase">{children}</span>
);

export default function Fitosanitarios() {
  const [identificador, setIdentificador] = useState('');
  const [titular, setTitular] = useState<Certificado | null>(null);
  const [error, setError] = useState('');
  const [paso, setPaso] = useState<Paso>('buscar');
  const [nuevo, setNuevo] = useState<Certificado | null>(null);

  function consultar(event: FormEvent) {
    event.preventDefault();
    const id = normalizarIdentificador(identificador);
    if (id.length !== 8 && id.length !== 11) {
      setError('Ingresá un DNI de 8 dígitos o un CUIT de 11 dígitos.');
      setTitular(null);
      return;
    }
    setError('');
    const found = buscarCertificado(id);
    setTitular(found);
    if (!found) setError('No encontramos un certificado para ese DNI o CUIT. Revisá el dato o consultá al área de Fitosanitarios.');
  }

  function pagar() {
    if (!titular) return;
    const emitido = new Date();
    const vence = new Date(emitido);
    vence.setFullYear(vence.getFullYear() + 1);
    setNuevo({
      numero: `FITO-DEMO-${emitido.getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      identificador: titular.identificador,
      titular: titular.titular,
      actividad: titular.actividad,
      emitido: emitido.toISOString().slice(0, 10),
      vence: vence.toISOString().slice(0, 10),
    });
    setPaso('certificado');
  }

  function finalizar() {
    setPaso('buscar');
    setTitular(null);
    setNuevo(null);
    setIdentificador('');
  }

  return (
    <Marco>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-verde-700 hover:underline print:hidden">
          <ArrowLeft className="size-4" /> Inicio
        </Link>
        <header className="mb-8 print:hidden">
          <Kicker>Ministerio de Ecología</Kicker>
          <h1 className="mt-2 text-3xl leading-tight font-medium tracking-tight text-verde-800 sm:text-4xl">
            Registro de fitosanitarios y domisanitarios
          </h1>
          <p className="mt-2 text-muted-foreground">
            Consultá tu certificado y renovalo en línea. Cada certificado tiene validez de un año.
          </p>
        </header>

        <Pasos actual={paso} />

        <AnimatePresence mode="wait">
          {paso === 'buscar' && (
            <Tarjeta k="buscar">
              <h2 className="text-xl font-medium text-verde-800">Buscá tu último certificado</h2>
              <p className="mt-1 text-muted-foreground">Usá el DNI de la persona titular o el CUIT de la empresa.</p>
              <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={consultar}>
                <div className="flex-1">
                  <FloatingInput
                    label="DNI o CUIT"
                    inputMode="numeric"
                    autoComplete="off"
                    value={identificador}
                    onChange={(event) => setIdentificador(event.target.value)}
                    labelClassName="bg-white"
                    className="h-12 bg-white text-base focus:ring-3 focus:ring-rosa-600/20"
                  />
                </div>
                <Button type="submit" size="lg" className="h-12 rounded-lg px-6">
                  Buscar certificado
                </Button>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">Ej.: 20345678901</p>

              {error && (
                <p role="alert" className="mt-4 rounded-lg bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              {titular && (
                <div className="mt-6 border-t border-border pt-6">
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <Kicker>Último certificado</Kicker>
                      <h3 className="mt-1 text-lg font-medium">{titular.titular}</h3>
                    </div>
                    <Badge className="bg-ok/10 text-ok">Registro encontrado</Badge>
                  </div>
                  <dl className="my-5 grid gap-4 sm:grid-cols-2">
                    {[
                      ['Número', titular.numero],
                      ['DNI / CUIT', titular.identificador],
                      ['Actividad habilitada', titular.actividad],
                      ['Vencimiento', fecha(titular.vence)],
                    ].map(([dt, dd]) => (
                      <div key={dt} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{dt}</dt>
                        <dd className="mt-0.5 font-medium">{dd}</dd>
                      </div>
                    ))}
                  </dl>
                  <Button size="lg" className="rounded-lg" onClick={() => setPaso('pagar')}>
                    Renovar certificado
                  </Button>
                </div>
              )}
            </Tarjeta>
          )}

          {paso === 'pagar' && titular && (
            <Tarjeta k="pagar">
              <Kicker>Renovación anual</Kicker>
              <h2 className="mt-1 text-xl font-medium text-verde-800">Confirmá el pago</h2>
              <div className="my-6 flex items-center justify-between gap-4 border-y border-border py-5">
                <span>Certificado de fitosanitarios y domisanitarios</span>
                <strong className="text-xl whitespace-nowrap text-verde-700">{pesos(PRECIO_DEMO)}</strong>
              </div>
              <p className="text-sm text-muted-foreground">El nuevo certificado tendrá vigencia por un año desde la fecha de emisión.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="outline" size="lg" className="rounded-lg" onClick={() => setPaso('buscar')}>
                  Volver
                </Button>
                <Button size="lg" className="rounded-lg" onClick={pagar}>
                  Pagar (simulación)
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Demostración: no se realiza ningún cobro. El precio mostrado es ilustrativo.</p>
            </Tarjeta>
          )}

          {paso === 'certificado' && nuevo && (
            <Tarjeta k="certificado">
              <div className="mb-6 flex items-center gap-3 print:hidden">
                <span className="flex size-10 items-center justify-center rounded-full bg-ok/12 text-ok">
                  <Check className="size-5" />
                </span>
                <div>
                  <h2 className="text-xl font-medium text-verde-800">Certificado emitido</h2>
                  <p className="text-sm text-muted-foreground">El pago de demostración fue aprobado.</p>
                </div>
              </div>

              <article
                aria-label="Certificado de ejemplo"
                className="relative overflow-hidden rounded-xl border-2 border-verde-600/40 bg-linear-to-br from-white to-crema px-6 py-8 text-center sm:px-12 print:min-h-[90vh] print:[print-color-adjust:exact]"
              >
                <img src={flor} alt="" aria-hidden="true" className="pointer-events-none absolute -top-8 -right-8 size-32 opacity-20" />
                <div className="flex items-center justify-between gap-3 text-[0.65rem] font-semibold tracking-[0.08em] text-verde-700">
                  <span>MINISTERIO DE ECOLOGÍA Y RNR</span>
                  <span>REGISTRO PROVINCIAL</span>
                </div>
                <img src={logo} alt="Ecología Misiones" className="mx-auto mt-8 mb-6 h-16 w-auto" />
                <Kicker>Certificado de habilitación</Kicker>
                <h2 className="mt-1 mb-6 text-2xl font-medium text-verde-800">Fitosanitarios y domisanitarios</h2>
                <p className="text-muted-foreground">Se certifica que</p>
                <h3 className="my-2 text-2xl font-semibold">{nuevo.titular}</h3>
                <p>
                  DNI / CUIT: <strong>{nuevo.identificador}</strong>
                </p>
                <p className="mt-1">
                  se encuentra habilitado para <strong>{nuevo.actividad.toLowerCase()}</strong>.
                </p>
                <div className="my-8 flex justify-center gap-10 sm:gap-16">
                  {[
                    ['EMITIDO', nuevo.emitido],
                    ['VÁLIDO HASTA', nuevo.vence],
                  ].map(([l, v]) => (
                    <div key={l} className="flex flex-col gap-1">
                      <span className="text-[0.65rem] tracking-[0.08em] text-muted-foreground">{l}</span>
                      <strong className="text-verde-800">{fecha(v)}</strong>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between gap-3 border-t border-border pt-3 text-[0.62rem] font-semibold tracking-[0.08em] text-verde-700">
                  <span>N.º {nuevo.numero}</span>
                  <span>Documento de demostración</span>
                </div>
              </article>

              <div className="mt-6 flex flex-wrap gap-3 print:hidden">
                <Button size="lg" className="rounded-lg" onClick={() => window.print()}>
                  <Printer /> Imprimir / Guardar como PDF
                </Button>
                <Button variant="outline" size="lg" className="rounded-lg" onClick={finalizar}>
                  Finalizar
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground print:hidden">
                Este certificado es una maqueta. El formato oficial y la integración con el pago se definirán durante el relevamiento.
              </p>
            </Tarjeta>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-xs text-muted-foreground print:hidden">Versión de demostración · Los datos y el pago son ficticios.</p>
      </main>
    </Marco>
  );
}
