-- =====================================================================================================
-- LIMPIEZA DE DATOS DE PRUEBA (antes de pasar a producción)
-- =====================================================================================================
-- Borra todo lo que cargó el uso del sistema: solicitudes, documentos, sesiones, códigos de mail,
-- órdenes de pago / pagos / comprobantes, y el registro de titulares, objetos y certificados de los
-- tres módulos (fitosanitarios, consultores, reservas). Reinicia la numeración (FITO-…-000001, etc.).
--
-- NO toca (configuración, que hay que conservar):
--   pagos._migraciones, pagos.categorias, pagos.modulos (incluye su config), pagos.tarifas,
--   pagos.sistema_config, pagos.auditoria (opcional, ver el final), public.cons_tipos, public.res_tipos,
--   public.tipos_fito_domi (catálogo de Ecodatos) ni NINGUNA otra tabla de Ecodatos.
--   De public.fitosanitarios_domisanitarios borra SOLO las filas creadas por la botonera (titular_id no
--   nulo); las que cargó Ecodatos por su cuenta quedan.
--
-- NO borra los archivos subidos: están en Storage (buckets fitosanitarios, consultores y reservas).
-- Ver "Archivos" más abajo.
--
-- CÓMO USARLO (SQL editor de Ecodatos, con el rol postgres):
--   0. Hacer un backup antes (ver abajo).
--   1. Pegar TODO el archivo y ejecutarlo tal cual: termina en ROLLBACK, o sea que no cambia nada y
--      muestra una tabla de conteos "antes -> después" de lo que borraría. Revisarla.
--   2. Para borrar de verdad: cambiar la última línea `rollback;` por `commit;` y ejecutar de nuevo.
--   Es una sola transacción: si algo falla, no se borra nada.
--
-- BACKUP (en el server, antes del paso 2; ajustar host/usuario):
--   pg_dump "$DATABASE_URL_ADMIN" -n pagos -t public.fito_titulares -t public.fito_vinculos \
--     -t public.fito_certificados -t public.fitosanitarios_domisanitarios -t 'public.cons_*' -t 'public.res_*' \
--     -Fc -f backup-pagos-$(date +%Y%m%d).dump
--
-- ARCHIVOS (después del commit): vaciar los tres buckets desde Studio (/studio/ → Storage → cada bucket →
--   seleccionar todo → Delete). No borrar los buckets (los crean las migraciones). No conviene
--   hacerlo con `delete from storage.objects`: borra el registro pero deja el archivo en disco.
--
-- QUÉ HACER DESPUÉS: sacar docker-compose.prueba.yml del COMPOSE_FILE (apaga pago simulado, bandeja de
--   mails y emisión sin pagar), poner PAYMENT_PROVIDER=macroclick y mail real (ver docs/despliegue-docker.md),
--   y decidir si las filas de prueba que se agregaron a public.tipos_fito_domi se dejan.
-- =====================================================================================================

begin;

-- Foto "antes" de los conteos.
create temp table _antes on commit drop as
select * from (values
  ('pagos.fito_solicitudes',      (select count(*) from pagos.fito_solicitudes)),
  ('pagos.cons_solicitudes',      (select count(*) from pagos.cons_solicitudes)),
  ('pagos.res_solicitudes',       (select count(*) from pagos.res_solicitudes)),
  ('pagos.ordenes_pago',          (select count(*) from pagos.ordenes_pago)),
  ('pagos.pagos',                 (select count(*) from pagos.pagos)),
  ('pagos.comprobantes',          (select count(*) from pagos.comprobantes)),
  ('pagos.verificaciones_email',  (select count(*) from pagos.verificaciones_email)),
  ('public.fito_titulares',       (select count(*) from public.fito_titulares)),
  ('public.fito_certificados',    (select count(*) from public.fito_certificados)),
  ('public.fitosanitarios_domisanitarios (de la botonera)', (select count(*) from public.fitosanitarios_domisanitarios where titular_id is not null)),
  ('public.fitosanitarios_domisanitarios (de Ecodatos, se conservan)', (select count(*) from public.fitosanitarios_domisanitarios where titular_id is null)),
  ('public.cons_titulares',       (select count(*) from public.cons_titulares)),
  ('public.cons_certificados',    (select count(*) from public.cons_certificados)),
  ('public.res_titulares',        (select count(*) from public.res_titulares)),
  ('public.res_certificados',     (select count(*) from public.res_certificados))
) v(tabla, n);

-- 1) Trámite en pagos: de lo más dependiente a lo menos --------------------------------------------
-- Cada módulo: avisos, consultas al padrón, sesiones, enlaces, historial, observaciones, documentos, solicitudes.
delete from pagos.fito_avisos_vencimiento;
delete from pagos.fito_consultas_padron;
delete from pagos.fito_sesiones;
delete from pagos.fito_enlaces;
delete from pagos.fito_historial;
delete from pagos.fito_observaciones;
delete from pagos.fito_documentos;
delete from pagos.fito_solicitudes;

delete from pagos.cons_avisos_vencimiento;
delete from pagos.cons_consultas_padron;
delete from pagos.cons_sesiones;
delete from pagos.cons_enlaces;
delete from pagos.cons_historial;
delete from pagos.cons_observaciones;
delete from pagos.cons_documentos;
delete from pagos.cons_solicitudes;

delete from pagos.res_avisos_vencimiento;
delete from pagos.res_consultas_padron;
delete from pagos.res_sesiones;
delete from pagos.res_enlaces;
delete from pagos.res_historial;
delete from pagos.res_observaciones;
delete from pagos.res_documentos;
delete from pagos.res_solicitudes;

-- Dinero: comprobantes -> pagos -> órdenes (después de las solicitudes, que apuntan a la orden).
delete from pagos.comprobantes;
delete from pagos.pagos;
delete from pagos.ordenes_pago;

-- Códigos de verificación de mail (los de todos los módulos).
delete from pagos.verificaciones_email;

-- 2) Registro en public (Ecodatos): certificados -> objetos -> vínculos -> titulares -------------------
-- Los certificados no se pueden borrar (trigger "inmutable"): se desactiva SOLO durante esta transacción.
alter table public.fito_certificados disable trigger fito_certificados_inmutable;
alter table public.cons_certificados disable trigger cons_certificados_inmutable;
alter table public.res_certificados  disable trigger res_certificados_inmutable;

delete from public.fito_certificados;
delete from public.cons_certificados;
delete from public.res_certificados;

alter table public.fito_certificados enable trigger fito_certificados_inmutable;
alter table public.cons_certificados enable trigger cons_certificados_inmutable;
alter table public.res_certificados  enable trigger res_certificados_inmutable;

-- Fitosanitarios: la tabla es de Ecodatos y puede tener filas propias; se borran solo las de la botonera.
delete from public.fitosanitarios_domisanitarios where titular_id is not null;
delete from public.cons_registro;
delete from public.res_registro;

delete from public.fito_vinculos;
delete from public.cons_vinculos;
delete from public.res_vinculos;

delete from public.fito_titulares;
delete from public.cons_titulares;
delete from public.res_titulares;

-- 3) Numeración: vuelve a empezar --------------------------------------------------------------------
-- OJO: se usa ALTER SEQUENCE ... RESTART (se deshace con el ROLLBACK). NO usar setval(): no es
-- transaccional y en el ensayo dejaría la numeración en 1 con los datos todavía presentes.
alter sequence pagos.fito_solicitudes_numero_seq restart with 1;
alter sequence pagos.cons_solicitudes_numero_seq restart with 1;
alter sequence pagos.res_solicitudes_numero_seq  restart with 1;
alter sequence public.fito_certificados_numero_seq restart with 1;
alter sequence public.cons_certificados_numero_seq restart with 1;
alter sequence public.res_certificados_numero_seq  restart with 1;
alter sequence public.cons_registro_nro_seq restart with 1;
alter sequence public.res_registro_nro_seq  restart with 1;
-- Nº de registro de fitosanitarios: sigue después del mayor de los que conserva Ecodatos (como en la migración 0010).
do $$
declare siguiente bigint;
begin
  select coalesce(max(nullif(regexp_replace(nro_registro::text, '\D', '', 'g'), '')::bigint), 0) + 1
    into siguiente from public.fitosanitarios_domisanitarios;
  execute format('alter sequence public.fito_registro_nro_seq restart with %s', siguiente);
end $$;

-- Columnas identity (ids numéricos): vuelven a 1.
do $$
declare t text;
begin
  foreach t in array array[
    'pagos.ordenes_pago', 'pagos.pagos', 'pagos.comprobantes',
    'pagos.fito_documentos', 'pagos.fito_observaciones', 'pagos.fito_historial', 'pagos.fito_enlaces', 'pagos.fito_consultas_padron', 'pagos.fito_avisos_vencimiento',
    'pagos.cons_documentos', 'pagos.cons_observaciones', 'pagos.cons_historial', 'pagos.cons_enlaces', 'pagos.cons_consultas_padron', 'pagos.cons_avisos_vencimiento',
    'pagos.res_documentos',  'pagos.res_observaciones',  'pagos.res_historial',  'pagos.res_enlaces',  'pagos.res_consultas_padron',  'pagos.res_avisos_vencimiento',
    'public.fito_vinculos', 'public.cons_vinculos', 'public.res_vinculos'
  ] loop
    perform 1 from information_schema.columns
      where table_schema = split_part(t, '.', 1) and table_name = split_part(t, '.', 2) and column_name = 'id' and is_identity = 'YES';
    if found then
      execute format('alter table %s alter column id restart with 1', t);
    end if;
  end loop;
end $$;

-- 4) Opcional: el registro de auditoría (cambios de tarifas y de módulos). Por defecto se conserva.
-- delete from pagos.auditoria;

-- Resultado: antes -> después. Si todo está bien, cambiar ROLLBACK por COMMIT (ver arriba).
select a.tabla, a.n as antes,
       case a.tabla
         when 'pagos.fito_solicitudes' then (select count(*) from pagos.fito_solicitudes)
         when 'pagos.cons_solicitudes' then (select count(*) from pagos.cons_solicitudes)
         when 'pagos.res_solicitudes' then (select count(*) from pagos.res_solicitudes)
         when 'pagos.ordenes_pago' then (select count(*) from pagos.ordenes_pago)
         when 'pagos.pagos' then (select count(*) from pagos.pagos)
         when 'pagos.comprobantes' then (select count(*) from pagos.comprobantes)
         when 'pagos.verificaciones_email' then (select count(*) from pagos.verificaciones_email)
         when 'public.fito_titulares' then (select count(*) from public.fito_titulares)
         when 'public.fito_certificados' then (select count(*) from public.fito_certificados)
         when 'public.fitosanitarios_domisanitarios (de la botonera)' then (select count(*) from public.fitosanitarios_domisanitarios where titular_id is not null)
         when 'public.fitosanitarios_domisanitarios (de Ecodatos, se conservan)' then (select count(*) from public.fitosanitarios_domisanitarios where titular_id is null)
         when 'public.cons_titulares' then (select count(*) from public.cons_titulares)
         when 'public.cons_certificados' then (select count(*) from public.cons_certificados)
         when 'public.res_titulares' then (select count(*) from public.res_titulares)
         when 'public.res_certificados' then (select count(*) from public.res_certificados)
       end as despues
  from _antes a order by a.tabla;

rollback;
