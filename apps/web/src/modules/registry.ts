export type ModuloMenu = {
  slug: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  icono: string;
};

// Cada módulo aporta su ficha a la botonera. Al sumar trámites, se registra aquí
// su entrada; la implementación de cada flujo permanece dentro de su carpeta.
export const modulosMenu: ModuloMenu[] = [
  {
    slug: 'fitosanitarios',
    nombre: 'Registro de fitosanitarios y domisanitarios',
    descripcion: 'Pedí o renová tu certificado: presentá los requisitos en línea.',
    categoria: 'Registros y certificados',
    icono: 'leaf',
  },
  {
    slug: 'consultores',
    nombre: 'Registro de consultores',
    descripcion: 'Inscribite como consultor/a ambiental: presentá los requisitos en línea.',
    categoria: 'Registros y certificados',
    icono: 'user-check',
  },
  {
    slug: 'reservas',
    nombre: 'Reservas privadas',
    descripcion: 'Inscribí tu reserva privada: presentá los requisitos en línea.',
    categoria: 'Registros y certificados',
    icono: 'trees',
  },
];
