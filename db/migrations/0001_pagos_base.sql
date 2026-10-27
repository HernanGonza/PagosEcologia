-- Núcleo de la botonera en el Supabase de Ecodatos. Todo lo propio vive en el schema
-- `pagos`; de `public` (Ecodatos) solo se leen los registros que consulta cada módulo.

create schema if not exists pagos;
-- Nadie fuera de la API entra al schema (no se expone en PostgREST).
revoke all on schema pagos from public;

create table pagos.categorias (
  slug   text primary key,
  nombre text not null,
  orden  int  not null default 0
);

create table pagos.modulos (
  slug           text primary key,
  nombre         text not null,
  descripcion    text,
  icono          text,
  categoria_slug text not null references pagos.categorias(slug),
  tipo           text not null check (tipo in ('simple','consulta','complejo')),
  config         jsonb not null default '{}'::jsonb,
  orden          int  not null default 0,
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Tarifas versionadas por módulo y concepto. Rige la última con vigente_desde <= fecha;
-- las anteriores se conservan. Ver `Tarifa` en packages/shared/src/contrato.ts.
create table pagos.tarifas (
  id             bigint generated always as identity primary key,
  modulo_slug    text not null references pagos.modulos(slug),
  concepto       text not null,
  -- Importe en centavos (fijo/fórmula) o tramos [{desde, hasta?, importe}] (escala).
  valor          jsonb not null,
  vigente_desde  date not null,
  creado_por     text not null,
  created_at     timestamptz not null default now(),
  unique (modulo_slug, concepto, vigente_desde)
);

-- Intención de pago. Solo se crea cuando el trámite pasó todas sus validaciones.
create table pagos.ordenes_pago (
  id               bigint generated always as identity primary key,
  modulo_slug      text not null references pagos.modulos(slug),
  -- Registro del módulo al que corresponde (ej. id de fitosanitarios_domisanitarios).
  ref_id           text,
  identificador    text,
  datos            jsonb not null default '{}'::jsonb,
  importe_centavos bigint not null check (importe_centavos > 0),
  tarifas          jsonb not null default '[]'::jsonb,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','pagada','rechazada','vencida','anulada')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index ordenes_pago_modulo_fecha_idx on pagos.ordenes_pago (modulo_slug, created_at desc);
create index ordenes_pago_identificador_idx on pagos.ordenes_pago (identificador);
create index ordenes_pago_estado_idx on pagos.ordenes_pago (estado);

-- Intentos y notificaciones del proveedor (MacroClick o mock), con el payload crudo.
create table pagos.pagos (
  id                 bigint generated always as identity primary key,
  orden_id           bigint not null references pagos.ordenes_pago(id),
  proveedor          text not null,
  referencia_externa text,
  estado             text not null check (estado in ('pendiente','pagado','rechazado')),
  importe_centavos   bigint,
  payload            jsonb,
  created_at         timestamptz not null default now(),
  -- Webhooks idempotentes: la misma notificación no se registra dos veces.
  unique (proveedor, referencia_externa, estado)
);

create index pagos_orden_idx on pagos.pagos (orden_id);
create index pagos_fecha_idx on pagos.pagos (created_at desc);

create table pagos.comprobantes (
  id                  bigint generated always as identity primary key,
  orden_id            bigint not null unique references pagos.ordenes_pago(id),
  pago_id             bigint not null references pagos.pagos(id),
  numero              text not null unique,
  codigo_verificacion text not null unique,
  emitido_en          timestamptz not null default now()
);

create table pagos.auditoria (
  id         bigint generated always as identity primary key,
  actor      text not null,
  accion     text not null,
  entidad    text not null,
  entidad_id text,
  antes      jsonb,
  despues    jsonb,
  created_at timestamptz not null default now()
);

create index auditoria_entidad_idx on pagos.auditoria (entidad, entidad_id, created_at desc);

-- El front nunca accede directo; solo la API. Las políticas para su rol están en 0003.
alter table pagos.categorias   enable row level security;
alter table pagos.modulos      enable row level security;
alter table pagos.tarifas      enable row level security;
alter table pagos.ordenes_pago enable row level security;
alter table pagos.pagos        enable row level security;
alter table pagos.comprobantes enable row level security;
alter table pagos.auditoria    enable row level security;
