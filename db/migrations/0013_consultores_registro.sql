-- ============================================================================================
-- ECODATOS (esquema public) — registro de consultores: titulares, vínculos, inscripciones y certificados.
-- Módulo AUTÓNOMO: todo con prefijo cons_; no toca nada de fitosanitarios ni de tablas existentes.
-- Misma estructura que 0010 (fitosanitarios), pero el registro es una tabla NUEVA (public.cons_registro).
--
-- Esta migración toca tablas de la plataforma Ecodatos (public). La corre quien mantiene Ecodatos
-- (como `postgres`, igual que el resto).
--
--   1) public.cons_titulares     — una fila por titular (DNI/CUIT únicos y validados).
--   2) public.cons_vinculos      — mail ↔ titular, aprobado por un técnico; bajas con historial.
--   3) public.cons_tipos         — catálogo de tipos de inscripción (persona-fisica, persona-juridica).
--   4) public.cons_registro      — el REGISTRO: una fila por inscripción con su estado actual
--                                  (fecha_registro, vence_en que se pisa con cada certificado nuevo).
--   5) public.cons_certificados  — el HISTORIAL: una fila por certificado emitido, sin pisar nunca.
--   6) Funciones y vistas con la ÚNICA definición de "vigente / por comenzar / vencido / revocado".
--   7) Permisos mínimos para el rol `botonera`; anon/authenticated NO ven nada (son datos personales).
-- ============================================================================================

-- 1) Utilidades ---------------------------------------------------------------------------------

-- Fecha de hoy en Argentina: UNA sola definición para todo (el servidor puede estar en UTC).
create or replace function public.cons_hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- CUIT/CUIL con dígito verificador (módulo 11). Recibe solo dígitos.
create or replace function public.cons_cuit_valido(c text) returns boolean
language plpgsql immutable as $$
declare
  pesos int[] := array[5,4,3,2,7,6,5,4,3,2];
  suma int := 0;
  resto int;
  dv int;
begin
  if c is null or c !~ '^[0-9]{11}$' then return false; end if;
  for i in 1..10 loop
    suma := suma + substr(c, i, 1)::int * pesos[i];
  end loop;
  resto := suma % 11;
  dv := case resto when 0 then 0 when 1 then 9 else 11 - resto end;
  return dv = substr(c, 11, 1)::int;
end $$;

create or replace function public.cons_tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 2) Titulares ----------------------------------------------------------------------------------
create table public.cons_titulares (
  id            uuid primary key default gen_random_uuid(),
  tipo_persona  text not null check (tipo_persona in ('fisica', 'juridica')),
  -- Solo dígitos. Una persona física puede tener DNI y CUIT (el CUIT contiene el DNI).
  dni           text check (dni ~ '^[0-9]{7,8}$'),
  cuit          text check (cuit is null or public.cons_cuit_valido(cuit)),
  nombre        text not null check (length(btrim(nombre)) > 0),
  telefono      text,
  domicilio     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (dni is not null or cuit is not null),
  -- Una persona jurídica se identifica por CUIT.
  check (tipo_persona = 'fisica' or cuit is not null)
);
create unique index cons_titulares_dni_uq  on public.cons_titulares (dni)  where dni  is not null;
create unique index cons_titulares_cuit_uq on public.cons_titulares (cuit) where cuit is not null;
create index cons_titulares_nombre_idx on public.cons_titulares (lower(nombre));

create trigger cons_titulares_updated before update on public.cons_titulares
  for each row execute function public.cons_tocar_updated_at();

-- 3) Vínculos mail ↔ titular ---------------------------------------------------------------------
-- Se crea SOLO cuando un técnico aprueba una solicitud de ese mail para ese titular. Nunca se borra.
create table public.cons_vinculos (
  id                    bigint generated always as identity primary key,
  titular_id            uuid not null references public.cons_titulares(id),
  email                 text not null check (email = lower(email)),
  -- Casilla canónica (sin +etiqueta; sin puntos en Gmail): la calcula la API, igual que en `pagos`.
  email_canonico        text not null,
  -- Solicitud (de `pagos`, sin FK entre esquemas) cuya aprobación creó el vínculo.
  solicitud_id          uuid,
  aprobado_por          uuid not null,
  aprobado_por_nombre   text,
  aprobado_en           timestamptz not null default now(),
  -- Baja: a sí mismo es libre; a otro la resuelve un técnico (se puede pedir antes).
  baja_solicitada_en    timestamptz,
  baja_solicitada_por   text,
  baja_en               timestamptz,
  baja_por              text,
  baja_motivo           text
);
-- Un solo vínculo ACTIVO por (titular, casilla); las bajas quedan como historial.
create unique index cons_vinculos_activo_uq on public.cons_vinculos (titular_id, email_canonico) where baja_en is null;
create index cons_vinculos_email_idx on public.cons_vinculos (email_canonico) where baja_en is null;
create index cons_vinculos_titular_idx on public.cons_vinculos (titular_id);

-- 4) Tipos de inscripción (catálogo) -------------------------------------------------------------
-- El `slug` es el de modulos.config.solicitud.tipos (pagos). Provisorio hasta que el área confirme.
create table public.cons_tipos (
  id      uuid primary key default gen_random_uuid(),
  slug    text not null unique,
  nombre  text not null,
  activo  boolean not null default true
);
insert into public.cons_tipos (slug, nombre) values
  ('persona-fisica',   'Consultor/a individual'),
  ('persona-juridica', 'Empresa consultora');

-- 5) Registro: una fila por inscripción ----------------------------------------------------------
create sequence public.cons_registro_nro_seq;

create table public.cons_registro (
  id               uuid primary key default gen_random_uuid(),
  nro_registro     bigint unique default nextval('public.cons_registro_nro_seq'),
  titular_id       uuid references public.cons_titulares(id),
  tipo_id          uuid references public.cons_tipos(id),
  -- Etiqueta corta para buscar y mostrar: el NÚMERO DE MATRÍCULA.
  objeto_etiqueta  text,
  -- Resto de los datos de la inscripción (profesión, colegio, responsable técnico…), tal como se cargaron.
  datos            jsonb not null default '{}'::jsonb,
  -- Primera vez que se registró (no cambia nunca).
  fecha_registro   date not null default public.cons_hoy(),
  -- Hasta cuándo está cubierta la inscripción por el último certificado emitido. SE PISA en cada emisión
  -- (lo hace el trigger de cons_certificados); el detalle de cada período está en el historial.
  vence_en         date,
  -- Vencimiento de la constancia de matrícula vigente. Se copia del documento al emitir.
  matricula_vence_en date,
  revocado_en      timestamptz,
  revocado_motivo  text,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index cons_registro_titular_idx on public.cons_registro (titular_id);
create index cons_registro_etiqueta_idx on public.cons_registro (lower(objeto_etiqueta));
create index cons_registro_vence_idx on public.cons_registro (vence_en);
-- La misma matrícula no se registra dos veces para el mismo titular y tipo.
create unique index cons_registro_objeto_uq
  on public.cons_registro (titular_id, tipo_id, lower(objeto_etiqueta))
  where objeto_etiqueta is not null and revocado_en is null;

create trigger cons_registro_updated before update on public.cons_registro
  for each row execute function public.cons_tocar_updated_at();

-- 6) Historial de certificados -------------------------------------------------------------------
create sequence public.cons_certificados_numero_seq;

create table public.cons_certificados (
  id                   uuid primary key default gen_random_uuid(),
  -- Número legible y correlativo. NO va en el QR (no debe servir para adivinar otros).
  numero               text not null unique default (
                         'CERT-CONS-' || to_char(public.cons_hoy(), 'YYYY') || '-' ||
                         lpad(nextval('public.cons_certificados_numero_seq')::text, 6, '0')),
  registro_id          uuid not null references public.cons_registro(id),
  titular_id           uuid not null references public.cons_titulares(id),
  tipo_id              uuid references public.cons_tipos(id),
  -- Referencias a `pagos` (sin FK entre esquemas): la API valida que existan.
  solicitud_id         uuid,
  orden_id             bigint,
  -- Vigencia: vence_en = vigente_desde + 12 meses (lo calcula la API con fecha de Argentina).
  vigente_desde        date not null,
  vence_en             date not null,
  emitido_en           timestamptz not null default now(),
  -- Certificado anterior de la misma cadena; uno solo puede ser renovado una vez.
  renovado_de          uuid unique references public.cons_certificados(id),
  -- Código al azar (2 UUID = 244 bits) para el QR; la página pública busca por acá.
  codigo_verificacion  text not null unique default (
                         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  pdf_ruta             text,
  revocado_en          timestamptz,
  revocado_motivo      text,
  revocado_por         text,
  check (vence_en > vigente_desde),
  check (revocado_en is null or revocado_motivo is not null)
);
create index cons_certificados_registro_idx on public.cons_certificados (registro_id, vigente_desde desc);
create index cons_certificados_titular_idx on public.cons_certificados (titular_id, vence_en);
create index cons_certificados_vence_idx on public.cons_certificados (vence_en);
create index cons_certificados_solicitud_idx on public.cons_certificados (solicitud_id);

-- El historial no se corrige: una vez emitido solo se puede marcar la revocación (y una sola vez).
create or replace function public.cons_certificados_inmutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los certificados emitidos no se borran (se revocan).';
  end if;
  if (to_jsonb(new) - 'revocado_en' - 'revocado_motivo' - 'revocado_por')
     is distinct from (to_jsonb(old) - 'revocado_en' - 'revocado_motivo' - 'revocado_por') then
    raise exception 'Un certificado emitido solo admite marcar su revocación.';
  end if;
  if old.revocado_en is not null and new.revocado_en is distinct from old.revocado_en then
    raise exception 'El certificado ya estaba revocado.';
  end if;
  return new;
end $$;

create trigger cons_certificados_inmutable
  before update or delete on public.cons_certificados
  for each row execute function public.cons_certificados_inmutable();

-- Al emitir (INSERT) y al revocar (UPDATE de revocado_en) el registro se recalcula: queda el
-- vencimiento más tardío entre los certificados NO revocados, o null si ya no queda ninguno.
create or replace function public.cons_certificado_actualiza_registro() returns trigger
language plpgsql as $$
begin
  update public.cons_registro r
     set vence_en   = (select max(c.vence_en) from public.cons_certificados c
                        where c.registro_id = new.registro_id and c.revocado_en is null),
         updated_at = now()
   where r.id = new.registro_id;
  return new;
end $$;

create trigger cons_certificados_registro
  after insert or update of revocado_en on public.cons_certificados
  for each row execute function public.cons_certificado_actualiza_registro();

-- 7) Estado: UNA sola definición -----------------------------------------------------------------
create or replace function public.cons_estado_certificado(
  vigente_desde date, vence_en date, revocado_en timestamptz, hoy date default public.cons_hoy()
) returns text
language sql immutable as $$
  select case
    when revocado_en is not null then 'revocado'
    when hoy < vigente_desde     then 'por_comenzar'
    when hoy <= vence_en         then 'vigente'
    else 'vencido'
  end
$$;

create or replace function public.cons_estado_objeto(
  vence_en date, revocado_en timestamptz, hoy date default public.cons_hoy()
) returns text
language sql immutable as $$
  select case
    when revocado_en is not null then 'revocado'
    when vence_en is null        then 'sin_certificado'
    when hoy <= vence_en         then 'vigente'
    else 'vencido'
  end
$$;

-- Vistas con los permisos de quien consulta (security_invoker): respetan RLS de las tablas base.
create view public.cons_certificados_estado with (security_invoker = true) as
select c.*,
       public.cons_estado_certificado(c.vigente_desde, c.vence_en, c.revocado_en) as estado,
       c.vence_en - public.cons_hoy() as dias_para_vencer
  from public.cons_certificados c;

create view public.cons_registro_estado with (security_invoker = true) as
select r.*,
       public.cons_estado_objeto(r.vence_en, r.revocado_en) as estado,
       r.vence_en - public.cons_hoy() as dias_para_vencer,
       r.matricula_vence_en is not null and r.matricula_vence_en < public.cons_hoy() as matricula_vencida
  from public.cons_registro r;

-- Control: el vencimiento del registro tiene que coincidir con el del último certificado no revocado.
-- Debe devolver CERO filas.
create view public.cons_control_vigencia with (security_invoker = true) as
select r.id as registro_id, r.vence_en as registro_vence_en, u.vence_en as certificado_vence_en
  from public.cons_registro r
  left join lateral (
    select max(c.vence_en) as vence_en from public.cons_certificados c
     where c.registro_id = r.id and c.revocado_en is null
  ) u on true
 where r.titular_id is not null
   and r.vence_en is distinct from u.vence_en;

-- 8) Permisos ------------------------------------------------------------------------------------
-- Datos personales: Supabase da por defecto acceso a anon/authenticated en tablas nuevas de public.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select from pg_roles where rolname = r) then
      execute format('revoke all on public.cons_titulares, public.cons_vinculos, public.cons_tipos, public.cons_registro, public.cons_certificados from %I', r);
      execute format('revoke all on public.cons_certificados_estado, public.cons_registro_estado, public.cons_control_vigencia from %I', r);
      execute format('revoke all on sequence public.cons_registro_nro_seq, public.cons_certificados_numero_seq from %I', r);
      execute format('revoke execute on function public.cons_hoy(), public.cons_cuit_valido(text), public.cons_tocar_updated_at(), public.cons_certificados_inmutable(), public.cons_certificado_actualiza_registro() from %I', r);
    end if;
  end loop;
end $$;

alter table public.cons_titulares     enable row level security;
alter table public.cons_vinculos      enable row level security;
alter table public.cons_tipos         enable row level security;
alter table public.cons_registro      enable row level security;
alter table public.cons_certificados  enable row level security;

-- Rol de la API (botonera): lee, inserta y modifica solo lo que le toca.
grant select, insert on public.cons_titulares to botonera;
grant update (tipo_persona, dni, cuit, nombre, telefono, domicilio) on public.cons_titulares to botonera;

grant select, insert on public.cons_vinculos to botonera;
grant update (baja_solicitada_en, baja_solicitada_por, baja_en, baja_por, baja_motivo) on public.cons_vinculos to botonera;

grant select on public.cons_tipos to botonera;

-- El registro: puede dar de alta y mantener los datos (no `vence_en`: eso lo hace el trigger).
grant select, insert on public.cons_registro to botonera;
grant update (titular_id, tipo_id, objeto_etiqueta, datos, matricula_vence_en, revocado_en, revocado_motivo, activo)
  on public.cons_registro to botonera;

grant select, insert on public.cons_certificados to botonera;
grant update (revocado_en, revocado_motivo, revocado_por) on public.cons_certificados to botonera;

grant usage, select on sequence public.cons_registro_nro_seq, public.cons_certificados_numero_seq to botonera;

grant select on public.cons_certificados_estado, public.cons_registro_estado, public.cons_control_vigencia to botonera;
grant execute on function public.cons_hoy(), public.cons_cuit_valido(text),
                         public.cons_estado_certificado(date, date, timestamptz, date),
                         public.cons_estado_objeto(date, timestamptz, date) to botonera;

-- El trigger que actualiza el registro necesita poder pisar `vence_en`, que el rol no tiene por columna:
-- corre como su dueño (postgres).
alter function public.cons_certificado_actualiza_registro() security definer set search_path = public, pg_temp;

do $$
declare t text;
begin
  foreach t in array array['cons_titulares', 'cons_vinculos', 'cons_tipos', 'cons_registro', 'cons_certificados'] loop
    execute format('drop policy if exists botonera_api on public.%I', t);
    execute format('create policy botonera_api on public.%I for all to botonera using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- OPCIONAL (decide Ecodatos; NO se aplica): que el personal de la plataforma vea estas tablas.
-- Ver el final de 0010 para el ejemplo de política (grant select … to authenticated + policy por rol admin).
-- ---------------------------------------------------------------------------------------------
