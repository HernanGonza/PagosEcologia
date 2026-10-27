import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import Marco from '../../components/Marco';

export const Kicker = ({ children }: { children: ReactNode }) => (
  <span className="text-xs font-semibold tracking-[0.1em] text-rosa-600 uppercase">{children}</span>
);

/** Estructura común de las pantallas del trámite: volver, título y contenido. */
export function Pagina({ titulo, bajada, children }: { titulo: ReactNode; bajada?: ReactNode; children: ReactNode }) {
  return (
    <Marco>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-verde-700 hover:underline">
          <ArrowLeft className="size-4" /> Inicio
        </Link>
        <header className="mb-8">
          <Kicker>Fitosanitarios y domisanitarios</Kicker>
          <h1 className="mt-2 text-3xl leading-tight font-medium tracking-tight text-verde-800 sm:text-4xl">{titulo}</h1>
          {bajada && <p className="mt-2 text-muted-foreground">{bajada}</p>}
        </header>
        {children}
      </main>
    </Marco>
  );
}

/** Tarjeta de cada paso, con transición al cambiar. */
export function Tarjeta({ children, k, className }: { children: ReactNode; k: string; className?: string }) {
  return (
    <motion.section
      key={k}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={cn(
        'rounded-2xl border border-border bg-white p-5 shadow-[0_1px_2px_rgba(33,19,13,0.06),0_12px_34px_rgba(33,19,13,0.05)] sm:p-8',
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

export function Pasos({ nombres, actual }: { nombres: string[]; actual: number }) {
  return (
    <ol className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${nombres.length}, minmax(0, 1fr))` }} aria-label="Pasos del trámite">
      {nombres.map((nombre, i) => (
        <li
          key={nombre}
          aria-current={i === actual ? 'step' : undefined}
          className={cn(
            'flex flex-col gap-2 border-b-2 pb-3 text-xs sm:flex-row sm:items-center sm:text-sm',
            i <= actual ? 'border-verde-600 text-verde-700' : 'border-border text-muted-foreground',
            i === actual && 'font-semibold',
          )}
        >
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              i < actual ? 'bg-verde-600 text-white' : i === actual ? 'bg-rosa-600 text-white' : 'bg-crema-200 text-muted-foreground',
            )}
          >
            {i < actual ? <Check className="size-4" /> : i + 1}
          </span>
          {nombre}
        </li>
      ))}
    </ol>
  );
}

export function Aviso({ tono = 'error', children }: { tono?: 'error' | 'info' | 'ok'; children: ReactNode }) {
  return (
    <p
      role={tono === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg px-4 py-3 text-sm',
        tono === 'error' && 'bg-destructive/8 text-destructive',
        tono === 'info' && 'bg-crema-200 text-verde-800',
        tono === 'ok' && 'bg-ok/10 text-ok',
      )}
    >
      {children}
    </p>
  );
}
