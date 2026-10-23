import type { CatalogoResponse, Campo } from '@botonera/shared';

const cuil: Campo = { name: 'cuil', label: 'CUIL / CUIT', type: 'text', placeholder: '20-12345678-9', required: true };
const nombre: Campo = { name: 'nombre', label: 'Nombre y apellido / Razón social', type: 'text', required: true };

export const catalogoMock: CatalogoResponse = {
  categorias: [
    { slug: 'forestal', nombre: 'Forestal y bosques', orden: 1 },
    { slug: 'fitosanitario', nombre: 'Fitosanitarios', orden: 2 },
    { slug: 'fauna', nombre: 'Fauna', orden: 3 },
    { slug: 'ambiente', nombre: 'Control ambiental', orden: 4 },
    { slug: 'tramites', nombre: 'Trámites y tasas', orden: 5 },
  ],
  modulos: [
    { slug: 'multas-apeo-ilegal', nombre: 'Multas por apeo ilegal', descripcion: 'Pagá una multa con el número de acta', icono: 'trees', categoria_slug: 'forestal', tipo: 'consulta', orden: 1,
      campos: [cuil, { name: 'acta', label: 'N° de acta', type: 'text', placeholder: 'AP-2025-0001', required: true }], monto: 85000 },
    { slug: 'guias-forestales', nombre: 'Guías de tránsito forestal', descripcion: 'Productos y subproductos forestales', icono: 'truck', categoria_slug: 'forestal', tipo: 'complejo', orden: 2,
      campos: [cuil, nombre, { name: 'producto', label: 'Producto', type: 'select', options: ['Rollizos', 'Leña', 'Carbón', 'Tablas'], required: true }, { name: 'cantidad', label: 'Cantidad (m³)', type: 'number', required: true }], monto: 12000 },
    { slug: 'certificados-fitosanitarios', nombre: 'Certificados fitosanitarios', descripcion: 'Certificado de transporte y tránsito vegetal', icono: 'leaf', categoria_slug: 'fitosanitario', tipo: 'complejo', orden: 1,
      campos: [cuil, nombre, { name: 'producto', label: 'Producto vegetal', type: 'text', required: true }, { name: 'destino', label: 'Destino', type: 'text', required: true }], monto: 18000 },
    { slug: 'inscripcion-fitosanitaria', nombre: 'Inscripción de operadores', descripcion: 'Alta y renovación anual', icono: 'bug', categoria_slug: 'fitosanitario', tipo: 'simple', orden: 2,
      campos: [cuil, nombre], monto: 30000 },
    { slug: 'permiso-caza', nombre: 'Permisos de caza', descripcion: 'Caza deportiva y control de especies', icono: 'shield', categoria_slug: 'fauna', tipo: 'simple', orden: 2,
      campos: [cuil, nombre], monto: 15000 },
    { slug: 'tasa-evaluacion-ambiental', nombre: 'Evaluación de impacto ambiental', descripcion: 'Tasa de presentación de proyectos', icono: 'factory', categoria_slug: 'ambiente', tipo: 'complejo', orden: 1,
      campos: [cuil, nombre, { name: 'expediente', label: 'N° de expediente', type: 'text', required: true }], monto: 120000 },
    { slug: 'fiscalizacion-hidrica', nombre: 'Permisos de uso de agua', descripcion: 'Canon y permisos hídricos', icono: 'droplets', categoria_slug: 'ambiente', tipo: 'consulta', orden: 2,
      campos: [cuil, { name: 'permiso', label: 'N° de permiso', type: 'text', required: true }], monto: 45000 },
    { slug: 'areas-protegidas', nombre: 'Ingreso a áreas protegidas', descripcion: 'Entradas y permisos de visita', icono: 'mountain', categoria_slug: 'ambiente', tipo: 'simple', orden: 3,
      campos: [nombre, { name: 'cantidad', label: 'Cantidad de personas', type: 'number', required: true }], monto: 3500 },
    { slug: 'tasa-tramite', nombre: 'Tasa de trámite general', descripcion: 'Certificados, copias y otros trámites', icono: 'file-text', categoria_slug: 'tramites', tipo: 'simple', orden: 1,
      campos: [cuil, nombre, { name: 'detalle', label: 'Detalle del trámite', type: 'text', required: true }], monto: 2500 },
    { slug: 'libre-deuda', nombre: 'Libre deuda', descripcion: 'Certificado de libre deuda', icono: 'award', categoria_slug: 'tramites', tipo: 'simple', orden: 2,
      campos: [cuil, nombre], monto: 4000 },
  ],
};
