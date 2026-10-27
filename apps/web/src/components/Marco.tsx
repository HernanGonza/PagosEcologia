import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logo from '@botonera/marca/logos/ecologia-misiones-horizontal.svg';
import logoBlanco from '@botonera/marca/logos/ecologia-misiones-horizontal-blanco.svg';

/** Encabezado y pie comunes a la botonera y a todos los trámites. */
export default function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-crema font-marca text-foreground">
      <header className="border-b border-border bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Inicio: pagos y trámites">
            <img src={logo} alt="Ecología Misiones" className="h-11 w-auto sm:h-12" />
          </Link>
          <span className="text-right text-sm leading-tight text-muted-foreground">
            Pagos y trámites
            <span className="hidden sm:block">Ministerio de Ecología y RNR</span>
          </span>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="bg-verde-800 text-white/80 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <img src={logoBlanco} alt="Ecología Misiones" className="h-10 w-auto self-start" />
          <div className="text-sm sm:text-right">
            <div>Ministerio de Ecología y Recursos Naturales Renovables · Misiones</div>
            <a href="https://ecologia.misiones.gob.ar" className="text-rosa-300 hover:underline">
              ecologia.misiones.gob.ar
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
