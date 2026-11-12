-- Borra las solicitudes de fitosanitarios en estado 'aprobada' SIN titular (datos viejos o tocados a mano:
-- por la aplicación no se puede llegar a ese estado) junto con todo lo que cuelga de ellas.
-- Solo toca solicitudes sin orden de pago. Se aborta si no son exactamente 3 (ajustar el número si cambia).
-- Para consultores o reservas: cambiar el prefijo fito_ por cons_ o res_.
--
-- PASO 1 (solo mirar): ejecutar esta consulta y confirmar que salen las 3 esperadas:
--   select numero, email, tipo, created_at from pagos.fito_solicitudes
--    where estado = 'aprobada' and titular_id is null and orden_id is null order by numero;
-- PASO 2: ejecutar el bloque de abajo (una transacción: si algo falla, no se borra nada).
-- Los archivos subidos quedan en el bucket `fitosanitarios` (se pueden borrar a mano desde Studio).

begin;

create temp table _borrar on commit drop as
select id, numero from pagos.fito_solicitudes
 where estado = 'aprobada' and titular_id is null and orden_id is null;

do $$
declare n int := (select count(*) from _borrar);
begin
  if n <> 3 then
    raise exception 'Se esperaban 3 solicitudes y hay %. No se borró nada.', n;
  end if;
end $$;

-- Un documento de OTRA solicitud puede apuntar a uno de estos como "original" (renovación): se suelta ese vínculo.
update pagos.fito_documentos
   set origen_documento_id = null
 where origen_documento_id in (select id from pagos.fito_documentos where solicitud_id in (select id from _borrar))
   and solicitud_id not in (select id from _borrar);

delete from pagos.fito_enlaces       where solicitud_id in (select id from _borrar);
delete from pagos.fito_sesiones      where solicitud_id in (select id from _borrar);
delete from pagos.fito_observaciones where solicitud_id in (select id from _borrar);
delete from pagos.fito_historial     where solicitud_id in (select id from _borrar);
delete from pagos.fito_documentos    where solicitud_id in (select id from _borrar);
delete from pagos.fito_solicitudes   where id in (select id from _borrar);

commit;
