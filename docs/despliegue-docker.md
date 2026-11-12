# Despliegue en el dominio de ecodatos (`/pagos/...`)

Reconvertido el 2026-11-12: en vez de colgar de la IP, todo cuelga del dominio `https://ecodatos.ecologia.misiones.gob.ar`
detrás del nginx de ecodatos, igual que la wiki (`/wiki/`) y Vaultwarden (`/claves/`).
**Las imágenes todavía no se construyeron** (no hay Docker en la máquina de desarrollo): lo primero en el server es
`docker compose up -d --build` y corregir lo que salga. Sí se verificó: `npm run build` de los fronts con las bases nuevas, el
typecheck de la API, y en local el circuito aprobada → pago simulado → certificado → PDF → mail en la bandeja.

## Rutas
| URL | Qué es |
|---|---|
| `/pagos/publico/` | botonera pública (sin cuenta, código por mail) |
| `/pagos/tecnicos/` | paneles de área (técnicos) |
| `/pagos/recaudaciones/` | Dirección de Recaudaciones |
| `/pagos/administracion/` | administración del sistema |
| `/pagos/mail/` | bandeja de los mails que el sistema no envía (antes iban a la consola) |
| `/pagos/api/…` | la API (el nginx interno la pasa a `api:3001/api/…`) |

`/pagos/` redirige a `/pagos/publico/`. La API no puede colgar de `/api/` porque el nginx de ecodatos ya usa esa ruta.

## Cómo está armado
- `docker-compose.yml`: `api` + `web` (nginx con los 4 fronts + la bandeja). **No publica puertos.**
- `docker-compose.prueba.yml`: modo prueba (sin pasarela): `NODE_ENV=staging`, `PAYMENT_PROVIDER=mock`, `EMISION_SIMULADA=1`,
  `MAIL_PROVIDER=consola`, volumen `mail_buzon` y el botón de pago simulado en el front (`VITE_PAGO_SIMULADO=1`).
- `docker-compose.ecodatos.yml`: `web` con `container_name: pagos-web` y unido a la red externa `supabase` (la del nginx de ecodatos).
- `docker/ecodatos-nginx-pagos.conf`: el bloque que se **pega en el nginx de ecodatos** (un solo `location ^~ /pagos/` con
  `resolver 127.0.0.11` y `proxy_pass` por variable, igual que `/wiki/` y `/claves/`; no saca el prefijo).
- Los fronts usan `VITE_BASE` (su ruta) + `BrowserRouter basename`, y `VITE_API_BASE=/pagos/api` para llamar a la API.
  Sin esas variables (desarrollo) todo sigue en `/` y `/api`.

## Pasos en el server (VM de ecodatos)
1. Clonar el repo y crear `.env` a partir de `.env.ecodatos.example` (DB, Supabase, `VERIFICACION_SECRETO`, etc.).
   Tiene que traer `COMPOSE_FILE=docker-compose.yml:docker-compose.prueba.yml:docker-compose.ecodatos.yml`.
2. Migraciones: `select count(*) from pagos._migraciones;` debe dar 17 (ver `docs/lunes.md`). Sin las 17 la API no arranca.
3. `docker compose up -d --build`
4. Pegar `docker/ecodatos-nginx-pagos.conf` dentro del `server { }` de `ecodatos/infra/nginx/nginx.conf` (junto a wiki y claves)
   y recargar: `docker exec app-formularios-nginx nginx -t && docker exec app-formularios-nginx nginx -s reload`.
   (El contenedor se llama así en `ecodatos/docker-compose.yml`; confirmar en el server.) **Hace falta que `pagos-web` ya esté
   levantado**: igual el `resolver` evita que nginx falle al arrancar si no está.
5. Verificar: `https://ecodatos.ecologia.misiones.gob.ar/pagos/api/health`, `/pagos/publico/`, `/pagos/mail/`, y entrar a
   `/pagos/tecnicos/`, `/pagos/recaudaciones/` y `/pagos/administracion/` con usuarios reales de Ecodatos.
6. Verificar `TRUST_PROXY`: la cadena es HAProxy → nginx de ecodatos → nginx de pagos → API (por defecto `3`). Si la IP que ve
   la API es la de un proxy (o se puede falsear `X-Forwarded-For`), corregir. Ver `mails-y-seguridad.md` del módulo de fitosanitarios.
7. Cron diario en el host: `docker compose exec -T api npm run fitosanitarios:tareas` (idem `consultores:tareas`, `reservas:tareas`).

## Pago simulado (para la demostración)
En `/pagos/publico/`, una solicitud **aprobada** muestra «Pagar la tasa (simulado)». Al apretarlo: pasa a pagada, se emite el
certificado, llega el mail «pago recibido» (se ve en `/pagos/mail/`) y la pantalla muestra «Ver el certificado (PDF)» con el QR de
verificación. Rutas de la API (solo con `EMISION_SIMULADA=1` y fuera de producción): `POST /<modulo>/solicitud/pagar-simulado` y
`GET /<modulo>/solicitud/certificado/pdf`, ambas con la sesión del solicitante. Cuando exista la pasarela real, el botón se reemplaza
por el checkout (ver `docs/pasarelas.md`) y esto se apaga sacando `docker-compose.prueba.yml`.

## Bandeja de mails
Con `MAIL_PROVIDER=consola` la API guarda los últimos 200 mails (en memoria y en `/data/mail/mails.jsonl`, volumen `mail_buzon`)
y los sirve en `GET /pagos/api/mail`; la pantalla `/pagos/mail/` se refresca sola cada 3 s, destaca el código de verificación
y muestra el mail como lo vería la persona. Sigue saliendo también por el log del contenedor (`docker compose logs -f api`).
`MAIL_PANEL_CLAVE` (opcional, en el `.env`) hace que la pantalla pida una clave.

## Ojo
- **Modo prueba = inseguro**: cualquiera que llegue al server puede emitir certificados sin pagar y **leer los códigos de
  verificación y enlaces de acceso de todos los mails** (o sea, entrar a cualquier solicitud). Solo datos de prueba; usar
  `MAIL_PANEL_CLAVE` si el dominio es accesible desde internet. CORS queda abierto. Estado del sistema no avisa en este modo.
- Los certificados del modo prueba son reales en la base de Ecodatos: usar datos ficticios y limpiarlos después.
- **Producción real** exige `PAYMENT_PROVIDER=macroclick` (`core/payments/macroclick.ts` está vacío, ver `docs/pasarelas.md`),
  mail real (`GMAIL_*` o `MS_*`) y levantar sin `docker-compose.prueba.yml`.
- Si se sirve por HTTP las cookies van sin `Secure`; con el dominio por HTTPS, `WEB_URL=https://…` las marca `Secure`/`__Host-`.
