-- Trazabilidad de la revisión de solicitudes de fitosanitarios.
--   - Quién tomó la solicitud y cuándo (revisor_* + tomada_en). Si un técnico aprueba, observa o
--     rechaza sin tomarla antes, la toma en ese momento. Si después la resuelve otro, el que la
--     tomó no se pisa: la resolución va en resuelta_por_*.
--   - Cada acción del historial guarda también el mail y la IP de quien la hizo.

alter table pagos.fito_solicitudes
  add column revisor_email       text,
  add column tomada_en           timestamptz,
  add column resuelta_por_id     uuid,
  add column resuelta_por_nombre text,
  add column resuelta_por_email  text;

alter table pagos.fito_historial
  add column actor_email text,
  add column ip          text;

alter table pagos.fito_observaciones
  add column autor_email text;

-- Lo que ya se revisó antes de esta migración.
update pagos.fito_solicitudes s
   set tomada_en = (select min(h.created_at) from pagos.fito_historial h
                     where h.solicitud_id = s.id and h.actor = 'tecnico')
 where revisor_id is not null and tomada_en is null;

update pagos.fito_solicitudes
   set resuelta_por_id = revisor_id, resuelta_por_nombre = revisor_nombre
 where estado in ('aprobada', 'rechazada', 'pagada', 'emitida', 'vencida') and resuelta_en is not null and resuelta_por_id is null;
