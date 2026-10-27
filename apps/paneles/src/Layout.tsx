import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import logo from '@botonera/marca/logos/ecologia-misiones-horizontal.svg';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { confirmar } from '@/lib/alertas';
import { cn } from '@/lib/utils';
import { BadgePendientes, usePendientes } from './pendientes';
import { useSesion, useYo } from './sesion';

const iniciales = (texto: string) =>
  texto.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export default function Layout() {
  const { usuario, modulos } = useYo();
  const { salir } = useSesion();
  const { pendientes } = usePendientes();
  const nombre = usuario.nombre ?? usuario.email;

  return (
    <div className="flex min-h-svh flex-col bg-crema">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-3">
            <img src={logo} alt="Ecología Misiones" className="h-10 w-auto" />
            <span className="hidden rounded-full bg-verde-600 px-3 py-1 text-xs font-medium text-white sm:inline">Paneles de área</span>
          </NavLink>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {modulos.map((m) => (
              <NavLink
                key={m.slug}
                to={`/${m.slug}`}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm whitespace-nowrap',
                    isActive ? 'bg-crema-200 font-medium text-verde-800' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {m.nombre}
                <BadgePendientes n={pendientes[m.slug]} />
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right text-sm leading-tight sm:block">
              <div className="font-medium">{nombre}</div>
              <div className="text-xs text-muted-foreground">{usuario.esAdmin ? 'Administración de Ecodatos' : usuario.email}</div>
            </div>
            <Avatar className="size-9">
              <AvatarFallback className="bg-verde-600 text-sm text-white">{iniciales(nombre)}</AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => (await confirmar({ titulo: '¿Salir del panel?', texto: 'Para volver a entrar vas a necesitar tu usuario de Ecodatos.', boton: 'Salir', icono: 'question' })) && salir()}
              aria-label="Salir"
              title="Salir"
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
