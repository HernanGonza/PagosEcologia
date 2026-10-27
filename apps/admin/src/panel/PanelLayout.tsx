import { createContext, useContext, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import florLapacho from '@botonera/marca/logos/flor-lapacho.svg';
import logoEcologia from '@botonera/marca/logos/ecologia-misiones-horizontal.svg';
import type { PeriodoAdmin } from '@botonera/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import '@/components/watermelon/capitalio-dashboard/dashboard.css';
import { cn } from '@/lib/utils';
import { ContinuousTabs } from '@/components/watermelon/continuous-tabs';
import { itemDeRuta, seccionesNavegacion, type ItemNavegacion } from './navegacion';
import { LOGIN_CONECTADO, useSesion } from './sesion';

export const periodos: { valor: PeriodoAdmin; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: '7d', etiqueta: '7 días' },
  { valor: '30d', etiqueta: '30 días' },
  { valor: 'anio', etiqueta: 'Este año' },
];

const PeriodoContext = createContext<PeriodoAdmin>('30d');
export const usePeriodo = () => useContext(PeriodoContext);

function Marca() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <img src={logoEcologia} alt="Ecología Misiones" className="h-12 w-auto self-start" />
      <span className="w-fit rounded-full bg-verde-600 px-3 py-1 text-xs font-medium tracking-wide text-white">
        Recaudaciones
      </span>
    </div>
  );
}

function ItemMenu({ item }: { item: ItemNavegacion }) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const activo = itemDeRuta(pathname).ruta === item.ruta;
  const Icono = item.icono;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.nombre}
        isActive={activo}
        className={cn(
          'h-auto gap-2 rounded-lg px-3 py-3 text-base leading-5 text-muted-foreground transition-colors',
          'bg-transparent hover:bg-transparent active:bg-transparent data-active:bg-transparent!',
          'data-active:text-sidebar-accent-foreground',
          activo && 'active-sidebar-item',
        )}
      >
        <NavLink to={item.ruta} end={item.ruta === '/'} onClick={() => isMobile && setOpenMobile(false)}>
          <Icono />
          <span className="truncate">{item.nombre}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

const roles = { administrador: 'Administración', recaudaciones: 'Recaudaciones', area: 'Responsable de área', auditor: 'Auditoría' };

function PieUsuario() {
  const { usuario, cerrarSesion } = useSesion();
  const navigate = useNavigate();
  if (!usuario) return null;
  const iniciales = usuario.nombre.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  function salir() {
    cerrarSesion();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <div className="border-t" />
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10 rounded-lg after:rounded-lg">
          <AvatarFallback className="rounded-lg">{iniciales}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm leading-none font-medium text-sidebar-accent-foreground">{usuario.nombre}</span>
          <span className="truncate text-xs text-muted-foreground">
            {LOGIN_CONECTADO ? roles[usuario.rol] : 'Sin login (desarrollo)'}
          </span>
        </div>
        <Button size="icon" variant="ghost" className="group shrink-0" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut className="size-4 opacity-70 transition-opacity group-hover:opacity-100" />
        </Button>
      </div>
    </>
  );
}

function BarraLateral() {
  return (
    <Sidebar className="border-none! p-0.5 capitalio-dashboard">
      <SidebarHeader className="mb-6 flex-row items-start gap-2 px-4 pt-6 pb-0">
        <Marca />
      </SidebarHeader>
      <SidebarContent className="gap-3 px-4 pb-4">
        {seccionesNavegacion.map((seccion) => (
          <SidebarGroup key={seccion.etiqueta} className="gap-2 p-0">
            <SidebarGroupLabel className="px-2 py-3 text-base font-normal tracking-tight text-muted-foreground/70">
              {seccion.etiqueta}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                {seccion.items.map((item) => (
                  <ItemMenu key={item.ruta} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-3 px-4 pt-0 pb-5">
        <PieUsuario />
      </SidebarFooter>
    </Sidebar>
  );
}

function BarraSuperior({ periodo, setPeriodo }: { periodo: PeriodoAdmin; setPeriodo: (p: PeriodoAdmin) => void }) {
  const { pathname } = useLocation();
  const item = itemDeRuta(pathname);

  return (
    <header className="flex shrink-0 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="size-8.5 shrink-0 md:hidden [&_svg]:size-5!" />
        <img src={florLapacho} alt="" className="size-8 shrink-0 md:hidden" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="truncate text-lg leading-none font-semibold text-foreground md:text-xl">
            {item.titulo ?? item.nombre}
          </h1>
          <span className="text-xs text-muted-foreground md:text-sm">Importes en pesos argentinos</span>
        </div>
      </div>

      {item.conPeriodo ? (
        <ContinuousTabs
          size="sm"
          tabs={periodos.map((p) => ({ id: p.valor, label: p.etiqueta }))}
          defaultActiveId={periodo}
          onChange={(id) => setPeriodo(id as PeriodoAdmin)}
        />
      ) : null}
    </header>
  );
}

export default function PanelLayout() {
  const [periodo, setPeriodo] = useState<PeriodoAdmin>('30d');

  return (
    <PeriodoContext.Provider value={periodo}>
      <SidebarProvider
        defaultOpen
        className="capitalio-dashboard h-svh overflow-hidden no-scrollbar"
        style={{ '--sidebar-width': '15.625rem' } as CSSProperties}
      >
        <BarraLateral />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0.5 pl-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background shadow-custom">
            <BarraSuperior periodo={periodo} setPeriodo={setPeriodo} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Outlet />
            </div>
          </div>
        </main>
      </SidebarProvider>
    </PeriodoContext.Provider>
  );
}
