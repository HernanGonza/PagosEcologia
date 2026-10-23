-- Datos de ejemplo: reemplazar por la lista real del ministerio.
insert into recaudaciones.categorias (slug, nombre, orden) values
  ('forestal',      'Forestal',                 1),
  ('fitosanitario', 'Fitosanitarios',           2),
  ('tramites',      'Trámites y tasas',         3)
on conflict do nothing;

insert into recaudaciones.modulos (slug, nombre, descripcion, icono, categoria_slug, tipo, orden) values
  ('multas-apeo-ilegal', 'Multas por apeo ilegal', 'Pago de multas por apeo ilegal de árboles', 'trees', 'forestal', 'consulta', 1),
  ('fitosanitarios', 'Certificados fitosanitarios', 'Certificados de transporte y trámites fitosanitarios', 'leaf', 'fitosanitario', 'complejo', 1),
  ('tasa-ejemplo', 'Tasa de trámite (ejemplo)', 'Módulo simple de monto fijo', 'file-text', 'tramites', 'simple', 1)
on conflict do nothing;
