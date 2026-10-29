-- Copia mínima de lo que la botonera usa de Ecodatos, SOLO para la base local de pruebas
-- (npm run db:local). En Ecodatos estas tablas ya existen: este archivo nunca se corre allá.
-- Va antes de las migraciones porque 0003, 0005 y 0006 hacen grant/policy/insert sobre ellas.

create schema if not exists storage;
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists public.tipos_fito_domi (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null
);

create table if not exists public.fitosanitarios_domisanitarios (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  activo             boolean not null default true,
  orden              numeric,
  empresa            text,
  tipo_id            uuid references public.tipos_fito_domi(id),
  nro_registro       numeric,
  actividades        text,
  direccion          text,
  anio_pago_registro numeric
);

create table if not exists public.profiles (
  id        uuid primary key,
  full_name text
);
create table if not exists public.roles (
  id  uuid primary key default gen_random_uuid(),
  key text not null unique
);
create table if not exists public.usuarios_rol (
  user_id uuid not null,
  rol_id  uuid not null references public.roles(id),
  activo  boolean not null default true
);
create table if not exists public.areas (
  id     uuid primary key default gen_random_uuid(),
  key    text not null unique,
  activo boolean not null default true
);
create table if not exists public.formularios (
  id     uuid primary key default gen_random_uuid(),
  slug   text not null unique,
  activo boolean not null default true
);
create table if not exists public.usuarios_areas (
  user_id   uuid not null,
  area_id   uuid not null references public.areas(id),
  activo    boolean not null default true,
  es_editor boolean not null default true
);
create table if not exists public.usuarios_formularios (
  user_id       uuid not null,
  formulario_id uuid not null references public.formularios(id),
  es_editor     boolean not null default true
);

-- Persona de pruebas con rol superadmin: entra a todos los paneles (ver AUTH_LOCAL).
insert into public.roles (key) values ('superadmin') on conflict (key) do nothing;
insert into public.profiles (id, full_name)
values ('00000000-0000-0000-0000-000000000001', 'Usuario local de pruebas')
on conflict (id) do nothing;
insert into public.usuarios_rol (user_id, rol_id)
select '00000000-0000-0000-0000-000000000001', id from public.roles where key = 'superadmin'
 and not exists (select 1 from public.usuarios_rol where user_id = '00000000-0000-0000-0000-000000000001');
insert into public.formularios (slug) values ('fitosanitarios_domisanitarios') on conflict (slug) do nothing;
