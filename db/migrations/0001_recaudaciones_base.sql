create schema if not exists recaudaciones;

create table recaudaciones.categorias (
  slug   text primary key,
  nombre text not null,
  orden  int  not null default 0
);

create table recaudaciones.modulos (
  slug           text primary key,
  nombre         text not null,
  descripcion    text,
  icono          text,
  categoria_slug text not null references recaudaciones.categorias(slug),
  tipo           text not null check (tipo in ('simple','consulta','complejo')),
  config         jsonb not null default '{}'::jsonb,
  orden          int  not null default 0,
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- El front nunca accede directo; solo la API (rol de servicio).
alter table recaudaciones.categorias enable row level security;
alter table recaudaciones.modulos    enable row level security;
