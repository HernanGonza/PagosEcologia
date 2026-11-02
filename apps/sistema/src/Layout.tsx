import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import logo from '@botonera/marca/logos/ecologia-misiones-horizontal.svg';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { confirmar } from '@/lib/alertas';
import { useSesion, useUsuario } from './sesion';

const secciones = [
  { ruta: '/', nombre: 'Módulos' },
  { ruta: '/mantenimiento', nombre: 'Mantenimiento y avisos' },
  { ruta: '/estado', nombre: 'Estado' },
  { ruta: '/auditoria', nombre: 'Auditoría' },
  { ruta: '/accesos', nombre: 'Accesos' },
];

export default function Layout() {
  const usuario = useUsuario();
  const { salir } = useSesion();
  return (
    <div className="flex min-h-svh flex-col bg-crema">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 sm:px-6">
          <img src={logo} alt="Ecología Misiones" className="h-10 w-auto" />
          <span className="rounded-full bg-verde-800 px-3 py-1 text-xs font-medium text-white">Administración del sistema</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right text-sm leading-tight sm:block">
              <div className="font-medium">{usuario.nombre ?? usuario.email}</div>
              <div className="text-xs text-muted-foreground">Administrador técnico</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => (await confirmar({ titulo: '¿Salir?', texto: 'Para volver a entrar vas a necesitar tu usuario de Ecodatos.', boton: 'Salir', icono: 'question' })) && salir()}
              aria-label="Salir"
              title="Salir"
            >
              <LogOut />
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {secciones.map((x) => (
            <NavLink key={x.ruta} to={x.ruta} end className={({ isActive }) => cn('rounded-full px-3 py-1.5 text-sm whitespace-nowrap', isActive ? 'bg-crema-200 font-medium text-verde-800' : 'text-muted-foreground hover:text-foreground')}>{x.nombre}</NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
