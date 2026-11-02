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
  -- Columnas de la tabla real de Ecodatos (según un registro exportado). Los números vienen como texto.
  user_id            uuid,
  created_by         uuid,
  formulario_id      uuid,
  latitud_decimal    numeric,
  longitud_decimal   numeric,
  latitud_gms        text,
  longitud_gms       text,
  geom               text,
  departamento_id    uuid,
  municipio_id       uuid,
  orden              text,
  empresa            text,
  tipo_id            uuid references public.tipos_fito_domi(id),
  nro_registro       text,
  actividades        text,
  direccion          text,
  anio_pago_registro text,
  fotos              jsonb default '[]'::jsonb,
  audios             jsonb default '[]'::jsonb
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
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  nombre      text,
  descripcion text,
  activo      boolean not null default true
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

-- Columnas que la base real ya tiene (para bases locales armadas con una versión anterior de este archivo).
alter table public.roles add column if not exists activo boolean not null default true;
alter table public.profiles add column if not exists email text;
alter table public.areas add column if not exists nombre text;
alter table public.areas add column if not exists descripcion text;

-- Rol que Supabase le da a los usuarios con sesión (0016 le da permiso a las funciones de estadísticas).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- auth.uid() de Supabase: toma el usuario de los claims del pedido (como PostgREST). Sin claims, null.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Persona de pruebas con rol superadmin: entra a todos los paneles (ver AUTH_LOCAL).
insert into public.roles (key) values ('superadmin') on conflict (key) do nothing;
insert into public.profiles (id, full_name)
values ('00000000-0000-0000-0000-000000000001', 'Usuario local de pruebas')
on conflict (id) do nothing;
insert into public.usuarios_rol (user_id, rol_id)
select '00000000-0000-0000-0000-000000000001', id from public.roles where key = 'superadmin'
 and not exists (select 1 from public.usuarios_rol where user_id = '00000000-0000-0000-0000-000000000001');
insert into public.formularios (slug) values ('fitosanitarios_domisanitarios'), ('registro_consultores'), ('registro_reservas_privadas') on conflict (slug) do nothing;
