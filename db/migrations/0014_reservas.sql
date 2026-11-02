-- Módulo "Registro de reservas privadas", lado `pagos`: solicitudes (altas y renovaciones) con revisión técnica, sin cuenta.
-- Módulo AUTÓNOMO: tablas propias (res_*), bucket propio, config propia. No toca nada de fitosanitarios.
-- Mismo flujo que fitosanitarios: la persona verifica su mail, carga datos y documentos y envía; los técnicos
-- aprueban, observan o rechazan; recién aprobada se habilita el pago (todavía no implementado) y se emite el
-- certificado. El REGISTRO (titulares, vínculos, certificados) vive en Ecodatos: migración 0015.
-- Las referencias a Ecodatos no llevan clave foránea (principio del proyecto): las valida la API.
-- Tipos, requisitos y tasas son PROVISORIOS hasta que el área los confirme.
-- (La verificación de mail por código, pagos.verificaciones_email, es del núcleo y se comparte por `proposito`.)

-- 1) Solicitudes. Sin cuenta: la persona entra con enlaces de un solo uso + sesión con cookie (res_enlaces / res_sesiones).
create sequence pagos.res_solicitudes_numero_seq;

create table pagos.res_solicitudes (
  id                   uuid primary key default gen_random_uuid(),
  numero               text not null unique default (
                         'RES-' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY') || '-' ||
                         lpad(nextval('pagos.res_solicitudes_numero_seq')::text, 6, '0')),
  -- Slug de un tipo de `modulos.config.solicitud.tipos` (se valida en la API).
  tipo                 text not null,
  estado               text not null default 'borrador'
                       check (estado in ('borrador','enviada','en_revision','observada','aprobada','pagada','emitida','rechazada','vencida')),
  email                text not null,
  -- Casilla "canónica" (sin +etiqueta; sin puntos en Gmail): los límites cuentan por casilla.
  email_canonico       text,
  datos                jsonb not null default '{}'::jsonb,
  -- Revisión. Los usuarios son de Ecodatos (auth.users.id), sin FK.
  revisor_id           uuid,
  revisor_nombre       text,
  revisor_email        text,
  tomada_en            timestamptz,
  enviada_en           timestamptz,
  resuelta_en          timestamptz,
  resuelta_por_id      uuid,
  resuelta_por_nombre  text,
  resuelta_por_email   text,
  aprobacion_vence     date,
  motivo_rechazo       text,
  orden_id             bigint references pagos.ordenes_pago(id),
  -- Alta (primera vez) o renovación de un certificado.
  tipo_solicitud       text not null default 'alta' check (tipo_solicitud in ('alta', 'renovacion')),
  -- public.res_titulares.id: se completa cuando el técnico aprueba (o al reconocer el DNI/CUIT).
  titular_id           uuid,
  -- public.res_registro.id: el registro que se renueva (en altas se completa al emitir).
  registro_id          uuid,
  -- public.res_certificados.id que esta solicitud renueva.
  renueva_certificado_id uuid,
  -- public.res_certificados.id emitido al terminar.
  certificado_id       uuid,
  -- Si el vínculo mail ↔ titular lo aprobó esta solicitud (public.res_vinculos.id).
  vinculo_id           bigint,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint res_solicitudes_renovacion_ck check ((tipo_solicitud = 'renovacion') = (renueva_certificado_id is not null))
);

create index res_solicitudes_estado_idx on pagos.res_solicitudes (estado, enviada_en);
create index res_solicitudes_email_idx on pagos.res_solicitudes (lower(email));
create index res_solicitudes_canonico_idx on pagos.res_solicitudes (email_canonico);
create index res_solicitudes_titular_idx on pagos.res_solicitudes (titular_id) where titular_id is not null;
create index res_solicitudes_registro_idx on pagos.res_solicitudes (registro_id) where registro_id is not null;
create index res_solicitudes_renueva_idx on pagos.res_solicitudes (renueva_certificado_id) where renueva_certificado_id is not null;
create index res_solicitudes_tipo_estado_idx on pagos.res_solicitudes (tipo_solicitud, estado, enviada_en);
-- Un certificado no puede tener dos renovaciones en curso a la vez.
create unique index res_solicitudes_renovacion_en_curso_uq
  on pagos.res_solicitudes (renueva_certificado_id)
  where renueva_certificado_id is not null and estado in ('borrador','enviada','en_revision','observada','aprobada','pagada');
-- Un certificado emitido pertenece a una sola solicitud.
create unique index res_solicitudes_certificado_uq on pagos.res_solicitudes (certificado_id) where certificado_id is not null;

-- 2) Documentos. Bucket privado `reservas`. Reemplazar no borra: queda con `reemplazado_en`.
create table pagos.res_documentos (
  id             bigint generated always as identity primary key,
  solicitud_id   uuid not null references pagos.res_solicitudes(id),
  requisito      text not null,
  ruta           text not null,
  nombre         text not null,
  tipo_mime      text not null,
  bytes          int  not null,
  sha256         text not null,
  -- Para requisitos con `venceEn` (ej. seguro de responsabilidad civil).
  vence_en       date,
  -- Si el documento se arrastró de una solicitud anterior (renovación), apunta al original.
  origen_documento_id bigint references pagos.res_documentos(id),
  reemplazado_en timestamptz,
  created_at     timestamptz not null default now()
);
create index res_documentos_solicitud_idx on pagos.res_documentos (solicitud_id, requisito);
-- Un documento arrastrado comparte el archivo del original: la ruta es única solo entre los originales.
create unique index res_documentos_ruta_uq on pagos.res_documentos (ruta) where origen_documento_id is null;
create index res_documentos_vence_idx on pagos.res_documentos (vence_en) where vence_en is not null;
create index res_documentos_origen_idx on pagos.res_documentos (origen_documento_id) where origen_documento_id is not null;

-- 3) Observaciones de los técnicos. Sin `requisito`, es general.
create table pagos.res_observaciones (
  id           bigint generated always as identity primary key,
  solicitud_id uuid not null references pagos.res_solicitudes(id),
  requisito    text,
  texto        text not null,
  autor_id     uuid not null,
  autor_nombre text,
  autor_email  text,
  resuelta_en  timestamptz,
  created_at   timestamptz not null default now()
);
create index res_observaciones_solicitud_idx on pagos.res_observaciones (solicitud_id);

-- 4) Historial de estados.
create table pagos.res_historial (
  id              bigint generated always as identity primary key,
  solicitud_id    uuid not null references pagos.res_solicitudes(id),
  estado_anterior text,
  estado_nuevo    text not null,
  actor           text not null check (actor in ('solicitante','tecnico','sistema')),
  actor_id        uuid,
  actor_nombre    text,
  actor_email     text,
  ip              text,
  nota            text,
  created_at      timestamptz not null default now()
);
create index res_historial_solicitud_idx on pagos.res_historial (solicitud_id, created_at);

-- 5) Enlaces de un solo uso (solo el hash) y sesiones (cookie; solo el hash).
create table pagos.res_enlaces (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity,
  solicitud_id uuid not null references pagos.res_solicitudes(id),
  token_hash   text not null unique,
  expira_en    timestamptz not null,
  usado_en     timestamptz,
  created_at   timestamptz not null default now()
);
create index res_enlaces_solicitud_idx on pagos.res_enlaces (solicitud_id);
create index res_enlaces_expira_idx on pagos.res_enlaces (expira_en);

-- La sesión puede estar atada a una solicitud (enlace del mail) o a un MAIL verificado (tablero "Mis certificados").
create table pagos.res_sesiones (
  id           uuid primary key default gen_random_uuid(),
  solicitud_id uuid references pagos.res_solicitudes(id),
  email        text,
  email_canonico text,
  cookie_hash  text not null unique,
  created_at   timestamptz not null default now(),
  ultimo_uso   timestamptz not null default now(),
  ip           text,
  user_agent   text,
  constraint res_sesiones_dueno_ck check (solicitud_id is not null or email_canonico is not null)
);
create index res_sesiones_solicitud_idx on pagos.res_sesiones (solicitud_id);
create index res_sesiones_email_idx on pagos.res_sesiones (email_canonico) where email_canonico is not null;

-- 4b) Consultas al padrón por los técnicos (datos personales, Ley 25.326): cada búsqueda y ficha queda registrada.
create table pagos.res_consultas_padron (
  id           bigint generated always as identity primary key,
  actor_id     uuid not null,
  actor_email  text,
  actor_nombre text,
  -- Qué buscó: 'dni' | 'cuit' | 'nombre' | 'numero' | 'reserva' | 'titular' (ficha abierta).
  criterio     text not null,
  termino      text,
  resultados   int,
  ip           text,
  created_at   timestamptz not null default now()
);
create index res_consultas_actor_idx on pagos.res_consultas_padron (actor_id, created_at desc);
create index res_consultas_fecha_idx on pagos.res_consultas_padron (created_at desc);

-- 4c) Avisos de vencimiento enviados: una fila por (certificado, anticipación, destinatario); el cron no repite.
create table pagos.res_avisos_vencimiento (
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
create index res_avisos_pendientes_idx on pagos.res_avisos_vencimiento (created_at) where enviado_en is null;

-- 6) RLS y política para la API, como el resto de `pagos` (ver 0003).
do $$
declare t text;
begin
  foreach t in array array['res_solicitudes','res_documentos','res_observaciones','res_historial','res_enlaces','res_sesiones','res_consultas_padron','res_avisos_vencimiento'] loop
    execute format('alter table pagos.%I enable row level security', t);
    execute format('drop policy if exists botonera_api on pagos.%I', t);
    execute format('create policy botonera_api on pagos.%I for all to botonera using (true) with check (true)', t);
  end loop;
end $$;

-- La API borra sesiones vencidas y enlaces viejos.
grant delete on pagos.res_enlaces, pagos.res_sesiones to botonera;
-- La auditoría de consultas solo se agrega.
revoke update on pagos.res_consultas_padron from botonera;

-- 7) Bucket privado para los documentos (solo la API entra; los técnicos ven enlaces firmados).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reservas', 'reservas', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- 8) Categoría y módulo. `panel.formularios`: el formulario de Ecodatos cuyos usuarios revisan
--    (lo define quien mantiene Ecodatos; los admin ven todos los paneles).
insert into pagos.categorias (slug, nombre, orden)
values ('reservas', 'Reservas privadas', 3)
on conflict (slug) do update set nombre = excluded.nombre;

insert into pagos.modulos (slug, nombre, descripcion, icono, categoria_slug, tipo, orden, config)
values ('reservas', 'Reservas privadas', 'Inscripción al registro de reservas privadas', 'trees', 'reservas', 'complejo', 3, '{
  "campos": [
    { "name": "identificador", "label": "DNI o CUIT del propietario", "type": "text", "required": true }
  ],
  "requisito": { "tipo": "revision" },
  "monto": {
    "tipo": "segun-opcion",
    "campo": "tipo",
    "conceptos": {
      "reserva-privada": "inscripcion-reserva-privada"
    }
  },
  "panel": { "formularios": ["registro_reservas_privadas"], "areas": [] },
  "renovacion": { "anticipacionDias": 30, "graciaDias": 30, "validezMeses": 12, "avisosDias": [30, 7] },
  "solicitud": {
    "aprobacionDias": 30,
    "requisitosComunes": [
      { "clave": "identificador", "etiqueta": "DNI o CUIT del propietario", "tipo": "texto", "formato": "dni-cuit", "obligatorio": true, "ayuda": "Solo números, sin guiones." },
      { "clave": "titular", "etiqueta": "Nombre y apellido o razón social del propietario", "tipo": "texto", "obligatorio": true },
      { "clave": "telefono", "etiqueta": "Teléfono de contacto", "tipo": "texto", "obligatorio": true },
      { "clave": "domicilio", "etiqueta": "Domicilio legal", "tipo": "texto", "obligatorio": true },
      { "clave": "constancia-identidad", "etiqueta": "Constancia de CUIT o DNI", "tipo": "documento", "obligatorio": true },
      { "clave": "representa", "etiqueta": "¿Quién presenta la solicitud?", "tipo": "opcion", "obligatorio": true,
        "opciones": ["Soy el titular", "Presento en nombre del titular"] },
      { "clave": "poder", "etiqueta": "Poder firmado (si presentás en nombre del titular)", "tipo": "documento", "obligatorio": false, "soloPoder": true,
        "ayuda": "PDF firmado que acredite que podés actuar en nombre del titular. No hace falta escribano y no vence." }
    ],
    "tipos": [
      {
        "slug": "reserva-privada",
        "nombre": "Reserva privada",
        "descripcion": "Para propietarios que inscriben un inmueble como reserva privada.",
        "requisitos": [
          { "clave": "nombre-reserva", "etiqueta": "Nombre de la reserva", "tipo": "texto", "obligatorio": true },
          { "clave": "ubicacion", "etiqueta": "Ubicación (municipio y paraje)", "tipo": "texto", "obligatorio": true },
          { "clave": "partida", "etiqueta": "Partida inmobiliaria", "tipo": "texto", "obligatorio": true },
          { "clave": "superficie", "etiqueta": "Superficie (hectáreas)", "tipo": "numero", "obligatorio": true },
          { "clave": "titulo-propiedad", "etiqueta": "Título de propiedad", "tipo": "documento", "obligatorio": true },
          { "clave": "plano-mensura", "etiqueta": "Plano de mensura", "tipo": "documento", "obligatorio": true },
          { "clave": "plan-manejo", "etiqueta": "Plan de manejo de la reserva", "tipo": "documento", "obligatorio": true },
          { "clave": "libre-deuda", "etiqueta": "Libre deuda de impuesto inmobiliario", "tipo": "documento", "obligatorio": true, "venceEn": true,
            "ayuda": "Cargá también la fecha de vencimiento." }
        ]
      }
    ]
  }
}'::jsonb)
on conflict (slug) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  tipo = excluded.tipo,
  config = excluded.config,
  activo = true;

-- 9) Tasas mock (centavos). VALORES DE PRUEBA: Recaudaciones los reemplaza desde el panel financiero.
--    La renovación paga la misma tasa que el alta.
insert into pagos.tarifas (modulo_slug, concepto, valor, vigente_desde, creado_por)
select 'reservas', c.concepto, to_jsonb(c.centavos), date '2026-01-01', 'mock-inicial'
  from (values
    ('inscripcion-reserva-privada', 1800000)
  ) as c(concepto, centavos)
on conflict (modulo_slug, concepto, vigente_desde) do nothing;
