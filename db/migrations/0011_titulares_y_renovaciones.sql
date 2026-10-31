-- Esquema `pagos`: lo que el trámite necesita para titulares, renovaciones y acceso por persona.
-- Diseño: apps/api/src/modules/fitosanitarios/docs/titulares-y-certificados.md (3.4, 4.x, 6.1). El registro en sí vive en Ecodatos (0010).
--
--   1) Solicitudes: tipo (alta | renovación), a qué titular / objeto / certificado se refieren.
--   2) Documentos: vencimiento (VTV, etc.) y documentos arrastrados de una solicitud anterior.
--   3) Sesión de persona (por mail + código).
--   4) Registro de consultas al padrón por los técnicos (datos personales, Ley 25.326).
--   5) Avisos de vencimiento enviados (para que el cron no repita mails).
--   6) Configuración del módulo: renovación, VTV con vencimiento, poder firmado.
--   7) Tasas mock editables por Recaudaciones (panel financiero).
-- Las referencias a Ecodatos no llevan clave foránea (principio del proyecto): las valida la API.

-- 1) Solicitudes -----------------------------------------------------------------------------------
alter table pagos.fito_solicitudes
  add column tipo_solicitud        text not null default 'alta' check (tipo_solicitud in ('alta', 'renovacion')),
  -- public.fito_titulares.id: se completa cuando el técnico aprueba (o al reconocer el DNI/CUIT).
  add column titular_id            uuid,
  -- public.fitosanitarios_domisanitarios.id: el objeto que se renueva (en altas se completa al emitir).
  add column registro_id           uuid,
  -- public.fito_certificados.id que esta solicitud renueva.
  add column renueva_certificado_id uuid,
  -- public.fito_certificados.id emitido al terminar.
  add column certificado_id        uuid,
  -- Si el vínculo mail ↔ titular lo aprobó esta solicitud (public.fito_vinculos.id).
  add column vinculo_id            bigint,
  -- Quién presenta no es el titular: pide poder firmado (el cálculo lo hace la API).
  add column actua_por_poder       boolean not null default false,
  add constraint fito_solicitudes_renovacion_ck
    check ((tipo_solicitud = 'renovacion') = (renueva_certificado_id is not null));

create index fito_solicitudes_titular_idx on pagos.fito_solicitudes (titular_id) where titular_id is not null;
create index fito_solicitudes_registro_idx on pagos.fito_solicitudes (registro_id) where registro_id is not null;
create index fito_solicitudes_renueva_idx on pagos.fito_solicitudes (renueva_certificado_id) where renueva_certificado_id is not null;
create index fito_solicitudes_tipo_estado_idx on pagos.fito_solicitudes (tipo_solicitud, estado, enviada_en);
-- Un certificado no puede tener dos renovaciones en curso a la vez.
create unique index fito_solicitudes_renovacion_en_curso_uq
  on pagos.fito_solicitudes (renueva_certificado_id)
  where renueva_certificado_id is not null and estado in ('borrador','enviada','en_revision','observada','aprobada','pagada');
-- Un certificado emitido pertenece a una sola solicitud.
create unique index fito_solicitudes_certificado_uq on pagos.fito_solicitudes (certificado_id) where certificado_id is not null;

-- 2) Documentos ------------------------------------------------------------------------------------
alter table pagos.fito_documentos
  -- Fecha de vencimiento que cargó la persona (VTV, seguro…); solo para requisitos con `venceEn`.
  add column vence_en            date,
  -- Si el documento se arrastró de una solicitud anterior (renovación), apunta al original.
  add column origen_documento_id bigint references pagos.fito_documentos(id);

-- Un documento arrastrado comparte el archivo del original: la ruta es única solo entre los originales.
alter table pagos.fito_documentos drop constraint fito_documentos_ruta_key;
create unique index fito_documentos_ruta_uq on pagos.fito_documentos (ruta) where origen_documento_id is null;
create index fito_documentos_vence_idx on pagos.fito_documentos (vence_en) where vence_en is not null;
create index fito_documentos_origen_idx on pagos.fito_documentos (origen_documento_id) where origen_documento_id is not null;

-- 3) Acceso por persona (mail verificado), además del acceso por solicitud ------------------------
-- (Los enlaces de mail siguen atados a una solicitud; la persona entra con mail + código.)
-- La sesión (cookie) pasa a poder estar atada a un MAIL en vez de a una solicitud.
alter table pagos.fito_sesiones
  alter column solicitud_id drop not null,
  add column email           text,
  add column email_canonico  text,
  add constraint fito_sesiones_dueno_ck check (solicitud_id is not null or email_canonico is not null);
update pagos.fito_sesiones s
   set email = so.email, email_canonico = so.email_canonico
  from pagos.fito_solicitudes so
 where so.id = s.solicitud_id;
create index fito_sesiones_email_idx on pagos.fito_sesiones (email_canonico) where email_canonico is not null;


-- 4) Consultas al padrón (panel de técnicos) -------------------------------------------------------
create table pagos.fito_consultas_padron (
  id           bigint generated always as identity primary key,
  actor_id     uuid not null,
  actor_email  text,
  actor_nombre text,
  -- Qué buscó: 'dni' | 'cuit' | 'nombre' | 'numero' | 'patente' | 'titular' (ficha abierta).
  criterio     text not null,
  termino      text,
  resultados   int,
  ip           text,
  created_at   timestamptz not null default now()
);
create index fito_consultas_actor_idx on pagos.fito_consultas_padron (actor_id, created_at desc);
create index fito_consultas_fecha_idx on pagos.fito_consultas_padron (created_at desc);

-- 5) Avisos de vencimiento enviados ----------------------------------------------------------------
-- Una fila por (certificado, anticipación, destinatario): el cron la inserta antes de mandar y no repite.
create table pagos.fito_avisos_vencimiento (
  id             bigint generated always as identity primary key,
  certificado_id uuid not null,
  -- Días para el vencimiento al enviar (30, 7, 0 = vence hoy, negativo = ya venció).
  dias_antes     int not null,
  email          text not null,
  enviado_en     timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  unique (certificado_id, dias_antes, email)
);
create index fito_avisos_pendientes_idx on pagos.fito_avisos_vencimiento (created_at) where enviado_en is null;

-- RLS y política para la API, como el resto de `pagos` (ver 0003). La auditoría de consultas solo se agrega.
do $$
declare t text;
begin
  foreach t in array array['fito_consultas_padron', 'fito_avisos_vencimiento'] loop
    execute format('alter table pagos.%I enable row level security', t);
    execute format('drop policy if exists botonera_api on pagos.%I', t);
    execute format('create policy botonera_api on pagos.%I for all to botonera using (true) with check (true)', t);
  end loop;
end $$;
revoke update on pagos.fito_consultas_padron from botonera;
-- (0003 dejó permisos por defecto para tablas nuevas de pagos: select, insert, update, y secuencias.)

-- 6) Configuración del módulo -----------------------------------------------------------------------
-- a) Reglas de renovación (README 4.4). Los días de aviso son para el cron (4.5).
-- b) Poder firmado para quien presenta en nombre de otro; no vence.
-- c) VTV del vehículo: documento obligatorio que VENCE (`venceEn`): la persona carga la fecha.
-- Los requisitos siguen siendo PROVISORIOS hasta que el área los confirme.
update pagos.modulos m
   set config = jsonb_set(
         jsonb_set(
           jsonb_set(
             m.config,
             '{renovacion}',
             '{"anticipacionDias": 30, "graciaDias": 30, "validezMeses": 12, "avisosDias": [30, 7]}'::jsonb
           ),
           '{solicitud,requisitosComunes}',
           (m.config->'solicitud'->'requisitosComunes') || '[
             { "clave": "representa", "etiqueta": "¿Quién presenta la solicitud?", "tipo": "opcion", "obligatorio": true,
               "opciones": ["Soy el titular", "Presento en nombre del titular"] },
             { "clave": "poder", "etiqueta": "Poder firmado (si presentás en nombre del titular)", "tipo": "documento", "obligatorio": false, "soloPoder": true,
               "ayuda": "PDF firmado que acredite que podés actuar en nombre del titular. No hace falta escribano y no vence." }
           ]'::jsonb
         ),
         '{solicitud,tipos}',
         (
           select jsonb_agg(
                    case when t->>'slug' = 'vehiculo' then
                      jsonb_set(t, '{requisitos}', (t->'requisitos') || '[
                        { "clave": "vtv", "etiqueta": "VTV vigente", "tipo": "documento", "obligatorio": true, "venceEn": true,
                          "ayuda": "Cargá también la fecha de vencimiento de la VTV." }
                      ]'::jsonb)
                    else t end
                    order by ord)
             from jsonb_array_elements(m.config->'solicitud'->'tipos') with ordinality as x(t, ord)
         )
       )
 where m.slug = 'fitosanitarios'
   and not (m.config->'solicitud'->'tipos' @> '[{"slug":"vehiculo","requisitos":[{"clave":"vtv"}]}]'::jsonb)
   and not (m.config->'solicitud'->'requisitosComunes' @> '[{"clave":"poder"}]'::jsonb);

-- 7) Tasas mock -------------------------------------------------------------------------------------
-- Importes en centavos. Son VALORES DE PRUEBA: Recaudaciones los reemplaza desde el panel financiero
-- cargando tarifas nuevas (la tarifa vigente es la de `vigente_desde` más reciente que ya rige).
-- La renovación paga la misma tasa que el alta.
insert into pagos.tarifas (modulo_slug, concepto, valor, vigente_desde, creado_por)
select 'fitosanitarios', c.concepto, to_jsonb(c.centavos), date '2026-01-01', 'mock-inicial'
  from (values
    ('certificado-comercio',        1500000),
    ('certificado-vehiculo',         800000),
    ('certificado-deposito',        2000000),
    ('certificado-fraccionamiento', 2500000)
  ) as c(concepto, centavos)
on conflict (modulo_slug, concepto, vigente_desde) do nothing;

-- 8) Restos del primer diseño ----------------------------------------------------------------------
-- La renovación ya no se guarda como una fila aparte: es una solicitud con `renueva_certificado_id`
-- y el certificado emitido queda en public.fito_certificados.
drop table if exists pagos.fito_renovaciones;
delete from pagos.tarifas where modulo_slug = 'fitosanitarios' and concepto = 'renovacion-anual';
