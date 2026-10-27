-- Módulo: registro y renovación anual de fitosanitarios y domisanitarios.
-- El registro es de Ecodatos (public.fitosanitarios_domisanitarios): acá no se copia,
-- solo se guarda cada renovación pagada y qué se modificó en el registro.
-- Pendiente del área: DNI/CUIT del titular y fecha de vencimiento en esa tabla.

insert into pagos.categorias (slug, nombre, orden)
values ('fitosanitario', 'Fitosanitarios', 1)
on conflict (slug) do update set nombre = excluded.nombre;

insert into pagos.modulos (slug, nombre, descripcion, icono, categoria_slug, tipo, orden, config)
values ('fitosanitarios', 'Registro de fitosanitarios y domisanitarios', 'Consulta y renovación anual de certificados', 'leaf', 'fitosanitario', 'complejo', 1,
        '{"validez_dias":365,"concepto":"renovacion-anual"}'::jsonb)
on conflict (slug) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  tipo = excluded.tipo,
  config = excluded.config,
  activo = true;

-- Una fila por renovación. Sin FK a public: el registro es de Ecodatos y no debe
-- quedar bloqueado por nuestras filas; se guarda una foto de lo que había y lo que quedó.
create table pagos.fito_renovaciones (
  id                bigint generated always as identity primary key,
  orden_id          bigint not null unique references pagos.ordenes_pago(id),
  registro_id       uuid not null,
  nro_registro      numeric,
  empresa           text,
  anio_anterior     numeric,
  anio_nuevo        numeric not null,
  vence_anterior    date,
  vence_nuevo       date,
  -- Cuándo se escribió el cambio en public.fitosanitarios_domisanitarios (null = todavía no).
  aplicado_en       timestamptz,
  created_at        timestamptz not null default now()
);

create index fito_renovaciones_registro_idx on pagos.fito_renovaciones (registro_id, created_at desc);

alter table pagos.fito_renovaciones enable row level security;
