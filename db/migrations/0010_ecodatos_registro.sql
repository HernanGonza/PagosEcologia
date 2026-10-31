-- ============================================================================================
-- ECODATOS (esquema public) — registro de titulares, vínculos y certificados.
-- Diseño: apps/api/src/modules/fitosanitarios/docs/titulares-y-certificados.md, secciones 3.0 a 3.3.
--
-- Esta migración toca tablas de la plataforma Ecodatos (public). La corre quien mantiene Ecodatos
-- (como `postgres`, igual que el resto). Es la ÚNICA que cambia public.fitosanitarios_domisanitarios.
--
-- Qué hace:
--   1) public.fito_titulares        — una fila por titular (DNI/CUIT únicos y validados).
--   2) public.fito_vinculos         — mail ↔ titular, aprobado por un técnico; bajas con historial.
--   3) public.fitosanitarios_domisanitarios (reconfigurada) — el REGISTRO: una fila por objeto
--      (vehículo, comercio, depósito, fraccionamiento) con su estado actual: fecha_registro y
--      vence_en (que se pisa con cada certificado nuevo) + vtv_vence_en.
--   4) public.fito_certificados     — el HISTORIAL: una fila por certificado emitido, sin pisar nunca.
--   5) Funciones y vistas con la ÚNICA definición de "vigente / por comenzar / vencido / revocado".
--   6) Permisos mínimos para el rol `botonera`; anon/authenticated NO ven nada (son datos personales).
--
-- Supuestos (los pidió el diseño): la tabla de registro está VACÍA y ninguna pantalla de Ecodatos
-- depende de `anio_pago_registro`. Si hubiera filas con ese dato, la migración se detiene sin cambios.
-- ============================================================================================

-- 0) Chequeo previo: no perder datos de renovación si alguien cargó algo.
do $$
begin
  if exists (select 1 from public.fitosanitarios_domisanitarios where anio_pago_registro is not null) then
    raise exception 'public.fitosanitarios_domisanitarios tiene filas con anio_pago_registro: revisar antes de reconfigurarla (esta migración asume la tabla sin datos de renovación).';
  end if;
  -- La API da de alta objetos con solo estas columnas. Si la tabla real de Ecodatos tiene otra columna
  -- obligatoria y sin valor por defecto (ej. user_id o formulario_id), el alta fallaría recién al emitir.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'fitosanitarios_domisanitarios'
       and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER'
       and column_name not in ('id', 'empresa', 'tipo_id', 'titular_id', 'objeto_etiqueta', 'datos', 'vtv_vence_en')
  ) then
    raise exception 'public.fitosanitarios_domisanitarios tiene columnas obligatorias sin valor por defecto (%): darles un default o permitir null antes de migrar.',
      (select string_agg(column_name, ', ') from information_schema.columns
        where table_schema = 'public' and table_name = 'fitosanitarios_domisanitarios'
          and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER'
          and column_name not in ('id', 'empresa', 'tipo_id', 'titular_id', 'objeto_etiqueta', 'datos', 'vtv_vence_en'));
  end if;
end $$;

-- 1) Utilidades ---------------------------------------------------------------------------------

-- Fecha de hoy en Argentina: UNA sola definición para todo (el servidor puede estar en UTC).
create or replace function public.fito_hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- CUIT/CUIL con dígito verificador (módulo 11). Recibe solo dígitos.
create or replace function public.fito_cuit_valido(c text) returns boolean
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

-- 2) Titulares ----------------------------------------------------------------------------------
create table public.fito_titulares (
  id            uuid primary key default gen_random_uuid(),
  tipo_persona  text not null check (tipo_persona in ('fisica', 'juridica')),
  -- Solo dígitos. Una persona física puede tener DNI y CUIT (el CUIT contiene el DNI).
  dni           text check (dni ~ '^[0-9]{7,8}$'),
  cuit          text check (cuit is null or public.fito_cuit_valido(cuit)),
  nombre        text not null check (length(btrim(nombre)) > 0),
  telefono      text,
  domicilio     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (dni is not null or cuit is not null),
  -- Una persona jurídica se identifica por CUIT.
  check (tipo_persona = 'fisica' or cuit is not null)
);
create unique index fito_titulares_dni_uq  on public.fito_titulares (dni)  where dni  is not null;
create unique index fito_titulares_cuit_uq on public.fito_titulares (cuit) where cuit is not null;
create index fito_titulares_nombre_idx on public.fito_titulares (lower(nombre));

create or replace function public.fito_tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger fito_titulares_updated before update on public.fito_titulares
  for each row execute function public.fito_tocar_updated_at();

-- 3) Vínculos mail ↔ titular ---------------------------------------------------------------------
-- Se crea SOLO cuando un técnico aprueba una solicitud de ese mail para ese titular. Nunca se borra.
create table public.fito_vinculos (
  id                    bigint generated always as identity primary key,
  titular_id            uuid not null references public.fito_titulares(id),
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
create unique index fito_vinculos_activo_uq on public.fito_vinculos (titular_id, email_canonico) where baja_en is null;
create index fito_vinculos_email_idx on public.fito_vinculos (email_canonico) where baja_en is null;
create index fito_vinculos_titular_idx on public.fito_vinculos (titular_id);

-- 4) Registro: public.fitosanitarios_domisanitarios (reconfigurada) ----------------------------
-- Se mantienen empresa, direccion, orden, actividades, tipo_id y nro_registro para no romper
-- pantallas de Ecodatos mientras se adaptan; `empresa` deja de ser obligatoria porque el nombre
-- ahora vive en el titular. `anio_pago_registro` se reemplaza por las fechas nuevas.
alter table public.fitosanitarios_domisanitarios alter column empresa drop not null;
alter table public.fitosanitarios_domisanitarios drop column anio_pago_registro;

create sequence public.fito_registro_nro_seq;
-- Si ya hubiera registros numerados, la secuencia sigue desde el mayor (no choca con el índice único).
select setval('public.fito_registro_nro_seq',
              coalesce((select max(nullif(regexp_replace(nro_registro::text, '\D', '', 'g'), '')::bigint)
                          from public.fitosanitarios_domisanitarios), 0) + 1,
              false);

alter table public.fitosanitarios_domisanitarios
  add column titular_id       uuid references public.fito_titulares(id),
  -- Etiqueta corta del objeto para buscar y mostrar: la PATENTE de un vehículo, la dirección de un local.
  add column objeto_etiqueta  text,
  -- Resto de los datos del objeto (marca y modelo, superficie, productos…), tal como se cargaron.
  add column datos            jsonb not null default '{}'::jsonb,
  -- Primera vez que se registró (no cambia nunca).
  add column fecha_registro   date not null default public.fito_hoy(),
  -- Hasta cuándo está cubierto el objeto por el último certificado emitido. SE PISA en cada emisión
  -- (lo hace el trigger de fito_certificados); el detalle de cada período está en el historial.
  add column vence_en         date,
  -- Vencimiento de la VTV vigente (solo vehículos). Se copia del documento al emitir.
  add column vtv_vence_en     date,
  add column revocado_en      timestamptz,
  add column revocado_motivo  text;

-- En Ecodatos `nro_registro` puede ser numérico o texto: el default se adapta al tipo real.
do $$
begin
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'fitosanitarios_domisanitarios' and column_name = 'nro_registro')
     in ('text', 'character varying') then
    alter table public.fitosanitarios_domisanitarios alter column nro_registro set default nextval('public.fito_registro_nro_seq')::text;
  else
    alter table public.fitosanitarios_domisanitarios alter column nro_registro set default nextval('public.fito_registro_nro_seq');
  end if;
end $$;
create unique index fito_registro_nro_uq on public.fitosanitarios_domisanitarios (nro_registro) where nro_registro is not null;
create index fito_registro_titular_idx on public.fitosanitarios_domisanitarios (titular_id);
create index fito_registro_etiqueta_idx on public.fitosanitarios_domisanitarios (lower(objeto_etiqueta));
create index fito_registro_vence_idx on public.fitosanitarios_domisanitarios (vence_en);
-- El mismo objeto (ej. la misma patente) no se registra dos veces para el mismo titular y tipo.
create unique index fito_registro_objeto_uq
  on public.fitosanitarios_domisanitarios (titular_id, tipo_id, lower(objeto_etiqueta))
  where objeto_etiqueta is not null and revocado_en is null;

-- 5) Historial de certificados -------------------------------------------------------------------
create sequence public.fito_certificados_numero_seq;

create table public.fito_certificados (
  id                   uuid primary key default gen_random_uuid(),
  -- Número legible y correlativo. NO va en el QR (no debe servir para adivinar otros).
  numero               text not null unique default (
                         'CERT-' || to_char(public.fito_hoy(), 'YYYY') || '-' ||
                         lpad(nextval('public.fito_certificados_numero_seq')::text, 6, '0')),
  registro_id          uuid not null references public.fitosanitarios_domisanitarios(id),
  titular_id           uuid not null references public.fito_titulares(id),
  tipo_id              uuid references public.tipos_fito_domi(id),
  -- Referencias a `pagos` (sin FK entre esquemas): la API valida que existan.
  solicitud_id         uuid,
  orden_id             bigint,
  -- Vigencia: vence_en = vigente_desde + 12 meses (lo calcula la API con fecha de Argentina).
  vigente_desde        date not null,
  vence_en             date not null,
  emitido_en           timestamptz not null default now(),
  -- Certificado anterior de la misma cadena; uno solo puede ser renovado una vez.
  renovado_de          uuid unique references public.fito_certificados(id),
  -- Código al azar (2 UUID = 244 bits) para el QR; la página pública busca por acá.
  codigo_verificacion  text not null unique default (
                         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  -- PDF emitido (ruta en el bucket privado).
  pdf_ruta             text,
  revocado_en          timestamptz,
  revocado_motivo      text,
  revocado_por         text,
  check (vence_en > vigente_desde),
  check (revocado_en is null or revocado_motivo is not null)
);
create index fito_certificados_registro_idx on public.fito_certificados (registro_id, vigente_desde desc);
create index fito_certificados_titular_idx on public.fito_certificados (titular_id, vence_en);
create index fito_certificados_vence_idx on public.fito_certificados (vence_en);
create index fito_certificados_solicitud_idx on public.fito_certificados (solicitud_id);

-- El historial no se corrige: una vez emitido solo se puede marcar la revocación (y una sola vez).
create or replace function public.fito_certificados_inmutable() returns trigger
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

create trigger fito_certificados_inmutable
  before update or delete on public.fito_certificados
  for each row execute function public.fito_certificados_inmutable();

-- Al emitir, el registro del objeto queda con el vencimiento del certificado nuevo (se pisa) y
-- ambas cosas pasan en la misma transacción que el INSERT. Si hubiera dos certificados cuya
-- vigencia se solapa, gana el que vence más tarde.
create or replace function public.fito_certificado_actualiza_registro() returns trigger
language plpgsql as $$
begin
  update public.fitosanitarios_domisanitarios r
     set vence_en   = (select max(c.vence_en) from public.fito_certificados c
                        where c.registro_id = new.registro_id and c.revocado_en is null),
         updated_at = now()
   where r.id = new.registro_id;
  return new;
end $$;

-- Al emitir (INSERT) y al revocar (UPDATE de revocado_en) el registro se recalcula: queda el
-- vencimiento más tardío entre los certificados NO revocados, o null si ya no queda ninguno.
create trigger fito_certificados_registro
  after insert or update of revocado_en on public.fito_certificados
  for each row execute function public.fito_certificado_actualiza_registro();

-- 6) Estado: UNA sola definición (README 6.2) ----------------------------------------------------
-- De un certificado puntual.
create or replace function public.fito_estado_certificado(
  vigente_desde date, vence_en date, revocado_en timestamptz, hoy date default public.fito_hoy()
) returns text
language sql immutable as $$
  select case
    when revocado_en is not null then 'revocado'
    when hoy < vigente_desde     then 'por_comenzar'
    when hoy <= vence_en         then 'vigente'
    else 'vencido'
  end
$$;

-- Del objeto (lo que se muestra en la ficha): sin certificado, revocado, vigente o vencido.
create or replace function public.fito_estado_objeto(
  vence_en date, revocado_en timestamptz, hoy date default public.fito_hoy()
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
create view public.fito_certificados_estado with (security_invoker = true) as
select c.*,
       public.fito_estado_certificado(c.vigente_desde, c.vence_en, c.revocado_en) as estado,
       c.vence_en - public.fito_hoy() as dias_para_vencer
  from public.fito_certificados c;

create view public.fito_registro_estado with (security_invoker = true) as
select r.*,
       public.fito_estado_objeto(r.vence_en, r.revocado_en) as estado,
       r.vence_en - public.fito_hoy() as dias_para_vencer,
       r.vtv_vence_en is not null and r.vtv_vence_en < public.fito_hoy() as vtv_vencida
  from public.fitosanitarios_domisanitarios r;

-- Control: el vencimiento del registro tiene que coincidir con el del último certificado no revocado.
-- Debe devolver CERO filas; si devuelve alguna, hay que revisarla (lo mira el cron de la fase 6).
create view public.fito_control_vigencia with (security_invoker = true) as
select r.id as registro_id, r.vence_en as registro_vence_en, u.vence_en as certificado_vence_en
  from public.fitosanitarios_domisanitarios r
  left join lateral (
    select max(c.vence_en) as vence_en from public.fito_certificados c
     where c.registro_id = r.id and c.revocado_en is null
  ) u on true
 where r.titular_id is not null
   and r.vence_en is distinct from u.vence_en;

-- 7) Permisos ------------------------------------------------------------------------------------
-- Datos personales: Supabase da por defecto acceso a anon/authenticated en tablas nuevas de public.
-- Se les quita todo; si Ecodatos quiere que su personal las vea desde la plataforma, se les da
-- lectura con una política propia (ver el final del archivo).
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select from pg_roles where rolname = r) then
      execute format('revoke all on public.fito_titulares, public.fito_vinculos, public.fito_certificados from %I', r);
      execute format('revoke all on public.fito_certificados_estado, public.fito_registro_estado, public.fito_control_vigencia from %I', r);
      execute format('revoke all on sequence public.fito_registro_nro_seq, public.fito_certificados_numero_seq from %I', r);
      execute format('revoke execute on function public.fito_hoy(), public.fito_cuit_valido(text), public.fito_tocar_updated_at(), public.fito_certificados_inmutable(), public.fito_certificado_actualiza_registro() from %I', r);
    end if;
  end loop;
end $$;

alter table public.fito_titulares     enable row level security;
alter table public.fito_vinculos      enable row level security;
alter table public.fito_certificados  enable row level security;

-- Rol de la API (botonera): lee, inserta y modifica solo lo que le toca.
grant select, insert on public.fito_titulares to botonera;
grant update (tipo_persona, dni, cuit, nombre, telefono, domicilio) on public.fito_titulares to botonera;

grant select, insert on public.fito_vinculos to botonera;
grant update (baja_solicitada_en, baja_solicitada_por, baja_en, baja_por, baja_motivo) on public.fito_vinculos to botonera;

grant select, insert on public.fito_certificados to botonera;
grant update (revocado_en, revocado_motivo, revocado_por) on public.fito_certificados to botonera;

-- Registro: ya tenía select y update de una columna (0003). La columna `anio_pago_registro` se fue
-- con el drop; ahora puede dar de alta objetos y mantener sus datos (no `vence_en`: eso lo hace el trigger).
grant insert on public.fitosanitarios_domisanitarios to botonera;
grant update (titular_id, tipo_id, objeto_etiqueta, datos, vtv_vence_en, revocado_en, revocado_motivo, activo)
  on public.fitosanitarios_domisanitarios to botonera;
grant usage, select on sequence public.fito_registro_nro_seq, public.fito_certificados_numero_seq to botonera;

grant select on public.fito_certificados_estado, public.fito_registro_estado, public.fito_control_vigencia to botonera;
grant execute on function public.fito_hoy(), public.fito_cuit_valido(text),
                         public.fito_estado_certificado(date, date, timestamptz, date),
                         public.fito_estado_objeto(date, timestamptz, date) to botonera;

-- Las funciones de trigger se ejecutan con el permiso de quien dispara el INSERT; el trigger que
-- actualiza el registro necesita poder pisar `vence_en`, que el rol no tiene por columna: corre como
-- su dueño (postgres).
alter function public.fito_certificado_actualiza_registro() security definer set search_path = public, pg_temp;

do $$
declare t text;
begin
  foreach t in array array['fito_titulares', 'fito_vinculos', 'fito_certificados'] loop
    execute format('drop policy if exists botonera_api on public.%I', t);
    execute format('create policy botonera_api on public.%I for all to botonera using (true) with check (true)', t);
  end loop;
end $$;

-- El registro ya tenía políticas de select y update (0003); falta la de alta.
drop policy if exists botonera_alta on public.fitosanitarios_domisanitarios;
create policy botonera_alta on public.fitosanitarios_domisanitarios
  for insert to botonera with check (true);

-- ---------------------------------------------------------------------------------------------
-- OPCIONAL (decide Ecodatos; NO se aplica): que el personal de la plataforma vea estas tablas.
--
-- grant select on public.fito_titulares, public.fito_vinculos, public.fito_certificados,
--                 public.fito_certificados_estado, public.fito_registro_estado to authenticated;
-- create policy staff_lectura on public.fito_titulares for select to authenticated
--   using (exists (select 1 from public.usuarios_rol ur join public.roles r on r.id = ur.rol_id
--                   where ur.user_id = auth.uid() and ur.activo and r.key in ('admin', 'superadmin')));
-- (y lo mismo para las otras dos tablas)
-- ---------------------------------------------------------------------------------------------
