// Adaptado de Watermelon UI `auth-11`, con la marca del Ministerio (Brandbook 2024).
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, type Variants } from 'motion/react';
import { BarChart3, Receipt, ShieldCheck } from 'lucide-react';
import flor from '@botonera/marca/logos/flor-lapacho.svg';
import logoBlanco from '@botonera/marca/logos/ecologia-misiones-vertical-blanco.svg';
import logoColor from '@botonera/marca/logos/ecologia-misiones-horizontal.svg';
import { LOGIN_CONECTADO, useSesion } from './sesion';

const contenedor: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

const puntos = [
  { icono: BarChart3, texto: 'Recaudación por día, trámite y período' },
  { icono: Receipt, texto: 'Pagos, órdenes y comprobantes en un solo lugar' },
  { icono: ShieldCheck, texto: 'Tarifas versionadas y auditoría de cada cambio' },
];

const claseInput =
  'w-full rounded-[14px] border border-border bg-white px-4 py-3.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-rosa-600 focus:ring-3 focus:ring-rosa-600/25 focus:outline-none';

/** Las tres flores del key visual, para la esquina del panel. */
function TresFlores({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <img src={flor} alt="" className="absolute top-0 right-10 size-28" />
      <img src={flor} alt="" className="absolute top-20 right-0 size-14" />
      <img src={flor} alt="" className="absolute top-24 right-28 size-10" />
    </div>
  );
}

export default function Login() {
  const { usuario, iniciarSesion } = useSesion();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [entrando, setEntrando] = useState(false);
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/';

  if (usuario) return <Navigate to={destino} replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEntrando(true);
    await iniciarSesion(email, clave);
    navigate(destino, { replace: true });
  }

  return (
    <div className="flex min-h-svh w-full flex-col bg-crema font-marca text-foreground antialiased lg:flex-row">
      <div className="relative hidden w-full p-4 lg:flex lg:min-h-svh lg:w-1/2">
        <div className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[32px] bg-linear-to-br from-verde-600 via-verde-700 to-verde-900 p-10 shadow-2xl">
          <TresFlores className="pointer-events-none absolute -top-6 -right-6 h-40 w-48 opacity-90" />
          <img src={logoBlanco} alt="Ecología Misiones" className="h-28 w-auto self-start" />

          <motion.ul variants={contenedor} initial="hidden" animate="visible" className="space-y-5">
            {puntos.map(({ icono: Icono, texto }) => (
              <motion.li key={texto} variants={item} className="flex items-center gap-3 text-white/90">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/12">
                  <Icono className="size-4.5" />
                </span>
                {texto}
              </motion.li>
            ))}
          </motion.ul>

          <div>
            <div className="mb-3 h-1 w-12 rounded-full bg-rosa-300" />
          </div>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2">
        <motion.div variants={contenedor} initial="hidden" animate="visible" className="w-full max-w-[400px]">
          <motion.div variants={item} className="mb-10 text-center">
            <img src={logoColor} alt="Ecología Misiones" className="mx-auto mb-8 h-14 w-auto lg:hidden" />
            <h2 className="text-3xl leading-tight font-medium tracking-tight text-balance text-verde-700 md:text-[40px]">
              Ingresá al panel de <span className="font-light text-rosa-600">Recaudaciones</span>
            </h2>
          </motion.div>

          {!LOGIN_CONECTADO ? (
            <motion.div
              variants={item}
              className="mb-8 rounded-[14px] border border-aviso/25 px-4 py-3 text-[13px] leading-5 text-aviso"
              style={{ backgroundColor: 'color-mix(in oklab, var(--amarillo-400) 18%, white)' }}
            >
              El ingreso todavía no está conectado: tocá <b>Ingresar</b> para entrar directo, sin completar nada.
            </motion.div>
          ) : null}

          <form className="flex flex-col gap-5" onSubmit={entrar}>
            <motion.div variants={item} className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium text-verde-800">
                Correo institucional
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="nombre@ecologia.misiones.gob.ar"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={LOGIN_CONECTADO}
                className={claseInput}
              />
            </motion.div>

            <motion.div variants={item} className="flex flex-col gap-2">
              <label htmlFor="clave" className="text-sm font-medium text-verde-800">
                Contraseña
              </label>
              <input
                id="clave"
                type="password"
                autoComplete="current-password"
                placeholder="Tu contraseña"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                required={LOGIN_CONECTADO}
                className={claseInput}
              />
            </motion.div>

            <motion.div variants={item} className="mt-4">
              <button
                type="submit"
                disabled={entrando}
                className="w-full rounded-full bg-verde-600 py-3.5 text-sm font-medium text-white shadow-[0_6px_20px_rgba(62,108,81,0.25)] transition-transform hover:bg-verde-700 focus-visible:ring-3 focus-visible:ring-rosa-600/35 focus-visible:outline-none active:scale-[0.96] disabled:opacity-60"
              >
                {entrando ? 'Ingresando…' : 'Ingresar'}
              </button>
            </motion.div>
          </form>

          <motion.p variants={item} className="mt-6 text-center text-[13px] text-muted-foreground">
            ¿Problemas para ingresar? Escribí al área de sistemas del Ministerio.
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
