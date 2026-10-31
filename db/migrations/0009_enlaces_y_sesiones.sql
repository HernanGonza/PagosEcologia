-- Acceso sin cuenta a las solicitudes: enlaces de un solo uso + sesión con cookie.
--
-- Enlace (mail): 32 bytes al azar, se guarda solo el hash. Se puede canjear UNA vez, dentro de su
-- plazo (`expira_en`); al canjearlo se abre una sesión (cookie) y el enlace deja de servir.
-- Un enlace nuevo vence los anteriores sin usar de la solicitud. `seq` ordena la emisión sin empates.
create table pagos.fito_enlaces (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity,
  solicitud_id uuid not null references pagos.fito_solicitudes(id),
  token_hash   text not null unique,
  expira_en    timestamptz not null,
  usado_en     timestamptz,
  created_at   timestamptz not null default now()
);
create index fito_enlaces_solicitud_idx on pagos.fito_enlaces (solicitud_id);
create index fito_enlaces_expira_idx on pagos.fito_enlaces (expira_en);

-- Sesión: la cookie (HttpOnly) lleva un valor al azar; acá queda solo su hash. Vence por
-- inactividad y por antigüedad máxima (se controlan en la API). Guarda IP y navegador para auditar.
create table pagos.fito_sesiones (
  id           uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references pagos.fito_solicitudes(id),
  cookie_hash  text not null unique,
  created_at   timestamptz not null default now(),
  ultimo_uso   timestamptz not null default now(),
  ip           text,
  user_agent   text
);
create index fito_sesiones_solicitud_idx on pagos.fito_sesiones (solicitud_id);

-- Los topes de pedidos de código cuentan por casilla "canónica" (sin +etiqueta; sin puntos en Gmail),
-- para que las variantes de un mismo mail no esquiven el tope.
alter table pagos.verificaciones_email add column email_canonico text;
update pagos.verificaciones_email set email_canonico = email;
create index verificaciones_email_canonico_idx on pagos.verificaciones_email (email_canonico, created_at desc);

-- Casilla "canónica" de cada solicitud (sin +etiqueta; sin puntos en Gmail): los límites de borradores y
-- de almacenamiento cuentan por casilla, no por mail exacto, para que las variantes no los esquiven.
alter table pagos.fito_solicitudes add column email_canonico text;
update pagos.fito_solicitudes set email_canonico =
  case when lower(split_part(email, '@', 2)) in ('gmail.com', 'googlemail.com')
       then replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
       else split_part(split_part(lower(email), '@', 1), '+', 1) || '@' || lower(split_part(email, '@', 2))
  end;
create index fito_solicitudes_canonico_idx on pagos.fito_solicitudes (email_canonico);

do $$
declare t text;
begin
  foreach t in array array['fito_enlaces','fito_sesiones'] loop
    execute format('alter table pagos.%I enable row level security', t);
    execute format('drop policy if exists botonera_api on pagos.%I', t);
    execute format('create policy botonera_api on pagos.%I for all to botonera using (true) with check (true)', t);
  end loop;
end $$;

-- Los enlaces viejos eran permanentes y se guardaban cifrados (SOLICITUDES_SECRETO). Dejan de
-- valer (se pide uno nuevo con el mail) y se borran las columnas con el hash y el token cifrado.
alter table pagos.fito_solicitudes drop column token_hash;
alter table pagos.fito_solicitudes drop column token_cifrado;

-- La API borra sesiones vencidas y enlaces viejos (0003 solo dio select, insert y update).
grant delete on pagos.fito_enlaces, pagos.fito_sesiones to botonera;
