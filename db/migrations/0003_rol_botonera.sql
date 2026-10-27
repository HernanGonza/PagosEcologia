-- Rol propio de la API, en vez de entrar como `postgres`.
-- La contraseña NO va acá: se fija aparte con `alter role botonera password '...'`
-- y se guarda solo en el .env. Por Supavisor el usuario es `botonera.<tenant>`.

do $$
begin
  if not exists (select from pg_roles where rolname = 'botonera') then
    create role botonera login noinherit;
  end if;
end $$;

-- Schema pagos: lectura y escritura de datos, sin DDL (las migraciones las corre postgres).
grant usage on schema pagos to botonera;
grant select, insert, update on all tables in schema pagos to botonera;
grant usage, select on all sequences in schema pagos to botonera;
alter default privileges in schema pagos grant select, insert, update on tables to botonera;
alter default privileges in schema pagos grant usage, select on sequences to botonera;
-- La auditoría solo se agrega, no se corrige.
revoke update on pagos.auditoria from botonera;

-- RLS: postgres no puede dar BYPASSRLS, así que cada tabla lleva su política.
-- Las tablas que sumen los módulos tienen que agregar la suya en su migración.
do $$
declare t text;
begin
  foreach t in array array['categorias','modulos','tarifas','ordenes_pago','pagos','comprobantes','auditoria','fito_renovaciones'] loop
    execute format('drop policy if exists botonera_api on pagos.%I', t);
    execute format('create policy botonera_api on pagos.%I for all to botonera using (true) with check (true)', t);
  end loop;
end $$;

-- Public (Ecodatos): solo lo que usa el módulo de fitosanitarios.
grant usage on schema public to botonera;
grant select on public.fitosanitarios_domisanitarios, public.tipos_fito_domi to botonera;
-- Solo la columna de la renovación; updated_at lo pone el trigger de la tabla.
-- Cuando el área agregue la fecha de vencimiento, sumarla acá en una migración nueva.
grant update (anio_pago_registro) on public.fitosanitarios_domisanitarios to botonera;

drop policy if exists botonera_lectura on public.fitosanitarios_domisanitarios;
create policy botonera_lectura on public.fitosanitarios_domisanitarios
  for select to botonera using (true);
drop policy if exists botonera_renovacion on public.fitosanitarios_domisanitarios;
create policy botonera_renovacion on public.fitosanitarios_domisanitarios
  for update to botonera using (true) with check (true);
