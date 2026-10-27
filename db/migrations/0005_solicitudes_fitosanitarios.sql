-- Fitosanitarios: solicitudes con revisión técnica, sin cuenta.
-- La persona elige el tipo de certificado, verifica su mail con un código, carga datos y
-- documentos y envía. Los técnicos (panel del área) aprueban, observan o rechazan; recién
-- con la solicitud aprobada se habilita el pago. La persona vuelve con un enlace privado.

-- 1) Verificación de mail por código, del núcleo: la usan todos los módulos sin cuenta.
--    Se guarda el hash del código, nunca el código.
create table pagos.verificaciones_email (
  id          bigint generated always as identity primary key,
  email       text not null,
  -- Para qué se pidió (ej. 'fitosanitarios:solicitud'); un código no sirve para otra cosa.
  proposito   text not null,
  codigo_hash text not null,
  intentos    int  not null default 0,
  expira_en   timestamptz not null,
  usado_en    timestamptz,
  ip          text,
  created_at  timestamptz not null default now()
);

create index verificaciones_email_email_idx on pagos.verificaciones_email (email, created_at desc);
create index verificaciones_email_ip_idx on pagos.verificaciones_email (ip, created_at desc);

-- 2) Solicitudes. El enlace privado se busca por su hash (`token_hash`) y se guarda cifrado
--    (`token_cifrado`, AES-GCM con SOLICITUDES_SECRETO del .env de la API) para poder mandarlo en
--    los avisos. Sin esa clave, la base sola no alcanza para entrar a una solicitud.
create sequence pagos.fito_solicitudes_numero_seq;

create table pagos.fito_solicitudes (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique default (
                     'FITO-' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY') || '-' ||
                     lpad(nextval('pagos.fito_solicitudes_numero_seq')::text, 6, '0')),
  token_hash       text not null unique,
  token_cifrado    text not null,
  -- Slug de un tipo de `modulos.config.solicitud.tipos` (se valida en la API).
  tipo             text not null,
  estado           text not null default 'borrador'
                   check (estado in ('borrador','enviada','en_revision','observada','aprobada','pagada','emitida','rechazada','vencida')),
  email            text not null,
  -- Datos cargados, por clave de requisito. Los documentos van en fito_documentos.
  datos            jsonb not null default '{}'::jsonb,
  -- Usuario de Ecodatos (auth.users.id) que tomó la revisión. Sin FK: auth es de Ecodatos.
  revisor_id       uuid,
  revisor_nombre   text,
  enviada_en       timestamptz,
  resuelta_en      timestamptz,
  aprobacion_vence date,
  motivo_rechazo   text,
  orden_id         bigint references pagos.ordenes_pago(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index fito_solicitudes_estado_idx on pagos.fito_solicitudes (estado, enviada_en);
create index fito_solicitudes_email_idx on pagos.fito_solicitudes (lower(email));

-- 3) Documentos presentados. Viven en el bucket privado `fitosanitarios` de Storage; acá queda
--    la referencia. Reemplazar un documento no lo borra: queda con `reemplazado_en`.
create table pagos.fito_documentos (
  id             bigint generated always as identity primary key,
  solicitud_id   uuid not null references pagos.fito_solicitudes(id),
  requisito      text not null,
  ruta           text not null unique,
  nombre         text not null,
  tipo_mime      text not null,
  bytes          int  not null,
  sha256         text not null,
  reemplazado_en timestamptz,
  created_at     timestamptz not null default now()
);

create index fito_documentos_solicitud_idx on pagos.fito_documentos (solicitud_id, requisito);

-- 4) Observaciones de los técnicos. Sin `requisito`, es una observación general.
create table pagos.fito_observaciones (
  id           bigint generated always as identity primary key,
  solicitud_id uuid not null references pagos.fito_solicitudes(id),
  requisito    text,
  texto        text not null,
  autor_id     uuid not null,
  autor_nombre text,
  resuelta_en  timestamptz,
  created_at   timestamptz not null default now()
);

create index fito_observaciones_solicitud_idx on pagos.fito_observaciones (solicitud_id);

-- 5) Historial de estados, para la persona y para el panel.
create table pagos.fito_historial (
  id              bigint generated always as identity primary key,
  solicitud_id    uuid not null references pagos.fito_solicitudes(id),
  estado_anterior text,
  estado_nuevo    text not null,
  actor           text not null check (actor in ('solicitante','tecnico','sistema')),
  actor_id        uuid,
  actor_nombre    text,
  nota            text,
  created_at      timestamptz not null default now()
);

create index fito_historial_solicitud_idx on pagos.fito_historial (solicitud_id, created_at);

-- 6) RLS y política para la API, como todas las tablas de `pagos` (ver 0003).
do $$
declare t text;
begin
  foreach t in array array['verificaciones_email','fito_solicitudes','fito_documentos','fito_observaciones','fito_historial'] loop
    execute format('alter table pagos.%I enable row level security', t);
    execute format('drop policy if exists botonera_api on pagos.%I', t);
    execute format('create policy botonera_api on pagos.%I for all to botonera using (true) with check (true)', t);
  end loop;
end $$;

-- 7) Bucket privado para los documentos. Solo la API entra, con la clave de servicio;
--    los técnicos los ven por enlaces firmados que duran minutos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fitosanitarios', 'fitosanitarios', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- 8) Config del módulo según ConfigModulo. Los tipos y requisitos son PROVISORIOS: los define
--    Control Ambiental (ver la sección 7 de la guía de relevamiento). Para cambiarlos, una
--    migración nueva que actualice `config`.
update pagos.modulos
   set descripcion = 'Pedí tu certificado de fitosanitarios y domisanitarios',
       config = '{
     "campos": [
       { "name": "identificador", "label": "DNI o CUIT del titular", "type": "text", "required": true }
     ],
     "requisito": { "tipo": "revision" },
     "monto": {
       "tipo": "segun-opcion",
       "campo": "tipo",
       "conceptos": {
         "vehiculo": "certificado-vehiculo",
         "comercio": "certificado-comercio",
         "deposito": "certificado-deposito"
       }
     },
     "panel": { "formularios": ["fitosanitarios_domisanitarios"], "areas": [] },
     "solicitud": {
       "aprobacionDias": 30,
       "requisitosComunes": [
         { "clave": "identificador", "etiqueta": "DNI o CUIT del titular", "tipo": "texto", "formato": "dni-cuit", "obligatorio": true, "ayuda": "Solo números, sin guiones." },
         { "clave": "titular", "etiqueta": "Nombre o razón social", "tipo": "texto", "obligatorio": true },
         { "clave": "telefono", "etiqueta": "Teléfono de contacto", "tipo": "texto", "obligatorio": true },
         { "clave": "domicilio", "etiqueta": "Domicilio legal", "tipo": "texto", "obligatorio": true },
         { "clave": "constancia-identidad", "etiqueta": "Constancia de CUIT o DNI", "tipo": "documento", "obligatorio": true }
       ],
       "tipos": [
         {
           "slug": "vehiculo",
           "nombre": "Vehículo de transporte",
           "descripcion": "Para vehículos que transportan productos fitosanitarios o domisanitarios.",
           "requisitos": [
             { "clave": "dominio", "etiqueta": "Dominio (patente)", "tipo": "texto", "obligatorio": true },
             { "clave": "marca-modelo", "etiqueta": "Marca y modelo", "tipo": "texto", "obligatorio": true },
             { "clave": "cedula", "etiqueta": "Cédula del vehículo", "tipo": "documento", "obligatorio": true },
             { "clave": "seguro", "etiqueta": "Póliza de seguro vigente", "tipo": "documento", "obligatorio": true }
           ]
         },
         {
           "slug": "comercio",
           "nombre": "Comercio",
           "descripcion": "Para locales que venden productos fitosanitarios o domisanitarios.",
           "requisitos": [
             { "clave": "direccion-local", "etiqueta": "Dirección del local", "tipo": "texto", "obligatorio": true },
             { "clave": "habilitacion-municipal", "etiqueta": "Habilitación municipal", "tipo": "documento", "obligatorio": true }
           ]
         },
         {
           "slug": "deposito",
           "nombre": "Depósito",
           "descripcion": "Para depósitos donde se almacenan productos fitosanitarios o domisanitarios.",
           "requisitos": [
             { "clave": "direccion-deposito", "etiqueta": "Dirección del depósito", "tipo": "texto", "obligatorio": true },
             { "clave": "superficie", "etiqueta": "Superficie (m²)", "tipo": "numero", "obligatorio": true },
             { "clave": "croquis", "etiqueta": "Plano o croquis del depósito", "tipo": "documento", "obligatorio": true },
             { "clave": "habilitacion-municipal", "etiqueta": "Habilitación municipal", "tipo": "documento", "obligatorio": true }
           ]
         }
       ]
     },
     "validez_dias": 365
   }'::jsonb
 where slug = 'fitosanitarios';
