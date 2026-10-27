import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, LogIn } from 'lucide-react';
import logo from '@botonera/marca/logos/ecologia-misiones-horizontal.svg';
import flor from '@botonera/marca/logos/flor-lapacho.svg';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/watermelon/floating-input';
import { supabaseConfigurado, useSesion } from './sesion';

const campo = 'h-12 bg-white text-base focus:border-rosa-600 focus:ring-3 focus:ring-rosa-600/20';

export default function Login() {
  const { estado, entrar } = useSesion();
  const navigate = useNavigate();
  const desde = (useLocation().state as { desde?: string } | null)?.desde ?? '/';
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  if (estado.tipo === 'lista') return <Navigate to={desde} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      await entrar(email.trim(), clave);
      navigate(desde, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setOcupado(false);
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-crema px-4 py-10">
      <img src={flor} alt="" aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-56 opacity-70" />
      <img src={flor} alt="" aria-hidden className="pointer-events-none absolute -bottom-12 -left-12 size-40 opacity-40" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="relative w-full max-w-md rounded-3xl border border-border bg-white p-8 shadow-[0_1px_2px_rgba(33,19,13,0.06),0_24px_60px_rgba(33,19,13,0.08)]"
      >
        <img src={logo} alt="Ecología Misiones" className="h-12 w-auto" />
        <span className="mt-8 block text-xs font-semibold tracking-[0.1em] text-rosa-600 uppercase">Paneles de área</span>
        <h1 className="mt-1 text-2xl font-medium text-verde-800">Ingresá con tu usuario de Ecodatos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Es el mismo mail y contraseña que usás en Ecodatos. Vas a ver los paneles de tu área.</p>

        {!supabaseConfigurado && (
          <p className="mt-6 rounded-lg bg-aviso/10 px-4 py-3 text-sm text-aviso">
            Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el .env.
          </p>
        )}

        <form className="mt-6 flex flex-col gap-4" onSubmit={enviar}>
          <FloatingInput label="Mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} labelClassName="bg-white" className={campo} />
          <FloatingInput label="Contraseña" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} labelClassName="bg-white" className={campo} />
          {error && <p role="alert" className="rounded-lg bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="h-12 rounded-full" disabled={ocupado || !supabaseConfigurado}>
            {ocupado ? <Loader2 className="animate-spin" /> : <LogIn />}
            Ingresar
          </Button>
        </form>
        <p className="mt-6 text-xs text-muted-foreground">¿Olvidaste la contraseña? Se recupera desde Ecodatos, con la opción «Olvidé mi contraseña».</p>
      </motion.div>
    </main>
  );
}
