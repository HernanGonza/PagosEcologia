# Bitácora del módulo fitosanitarios (sesión de trabajo)

Resumen para retomar sin releer la conversación. La conversación completa de Claude Code queda en el historial de la sesión
(`~/.claude/projects/-home-hernan-Escritorio-Ecologia-botonera-pagos/`, archivo `be77c133-…jsonl`).

## Estado en una línea
Migraciones `0009`–`0011`, API y front del registro de titulares/certificados **terminados y probados en la base local**; **nada está
commiteado ni corrido en el servidor**. **El pago NO está implementado.**

## Qué se hizo (en orden)
1. **Enlaces únicos y con vencimiento**: cada mail lleva un enlace nuevo de un solo uso (token en el fragmento `#`), que se canjea por una sesión con cookie; uno nuevo invalida los anteriores; cualquier 404/vencido redirige a pedir otro. Recuperar enlaces exige un código de verificación. → `mails-y-seguridad.md`.
2. **Revisiones de seguridad** (varias vueltas con Claude web): carreras, huso horario, límites por casilla canónica, HMAC de códigos, etc.
3. **Diseño del registro** (decidido con el dueño del proyecto): titulares por DNI/CUIT, vínculo mail↔titular que aprueba un técnico, certificados de 12 meses, renovación (una o varias, ventana −30/+30 días), QR de verificación, el registro vive en **Ecodatos** y los pagos/trámite en **`pagos`**. → `titulares-y-certificados.md`.
4. **Migraciones** `0009` (enlaces/sesiones), `0010` (Ecodatos: titulares, vínculos, registro reconfigurado, historial de certificados), `0011` (solicitudes de renovación, documentos con vencimiento, sesión de persona, consultas, avisos, tasas mock).
5. **API y front**: titular+vínculo al aprobar, VTV con vencimiento, emisión, PDF con QR, verificación pública, "Mis certificados", renovaciones, panel con primera vez/renovaciones, buscador y ficha de titulares, avisos de vencimiento, edición de tasas en el panel financiero.
6. **Orden del repo**: todo lo del módulo quedó en las carpetas del módulo (ver `README.md` de esta carpeta).

## Para dejar andando (lunes)
1. Copia de la base. `select count(*) from public.fitosanitarios_domisanitarios;` debe dar 0.
2. `npm run migrate` (corre 0009, 0010 y 0011 en orden).
3. `.env` del servidor: `VERIFICACION_SECRETO`, `TRUST_PROXY`, `WEB_URL`. **Sin** `EMISION_SIMULADA`.
4. Cron diario: `npm run fitosanitarios:tareas`.
5. Ecodatos: `tipos_fito_domi` con tipos que empiecen con comercio, vehículo, depósito y fraccionamiento.
6. Pendientes de producción de `mails-y-seguridad.md` (permisos/RLS de `pagos`, firewall del puerto de la API, probar el `#token` con clientes de mail reales).
7. Recorrer las pantallas nuevas en el navegador (`npm run dev`): solo se probaron compilando y contra la API.

## Qué falta
- **El pago** (MacroClick): llamar a `emitirCertificado`, sumar tasas de varias renovaciones en una orden, guardar `orden_id`, mail de emitido.
- Login del panel financiero y permisos de Recaudaciones; descuento por renovar varios.
- Otros documentos que vencen (seguro, habilitación); diseño final del PDF; retención del registro de consultas; mail al resolver una baja.
- Formularios y requisitos son **provisorios** hasta que Control Ambiental los confirme.

## Cómo probar localmente
`npm run dev` (levanta Postgres local + API + fronts; mails por consola). Con `EMISION_SIMULADA=1`:
`POST /api/fitosanitarios/dev/emitir/<número de solicitud aprobada>` simula el pago y emite. `npm run db:local -- reset` rearma la base.

## Decisiones del dueño del proyecto (resumen)
Registro desde cero (sin cargar certificados en papel) · varios representantes por empresa · todo alta pasa por técnico · bajas: cada uno a sí mismo libre, a otro con técnico · certificados 12 meses · renovación paga la tasa de nuevo y va a revisión si hay documento vencido, cambio de datos o documento nuevo · renovación anticipada vale desde el vencimiento anterior, tardía desde la emisión · poder firmado en PDF, sin escribano, no vence · avisos al mail de la solicitud del último certificado · VTV con vencimiento · tasas mock editables por Recaudaciones desde el panel financiero · Ecodatos lo mantiene el mismo dueño del proyecto.

## Revisión externa (Claude web, sobre el commit 156e12c) — 2026-10-31
Se corrigió casi todo (migraciones 0010/0011, bugs del código, README). Detalle de lo hecho:
trigger de revocación que recalcula `vence_en`, `setval` de `fito_registro_nro_seq`, chequeo de columnas obligatorias de Ecodatos en 0010,
stub local con las columnas reales, chequeo de migraciones al arrancar la API, tarifas con 409, VTV vencida rechazada,
vigencia de 12 meses exactos, avisos a representantes activos, guardas de producción y CORS, `migrate.ts` con candado y URL obligatoria.

### Decisiones que faltan (contesta el dueño del proyecto)
1. **Fila real en `fitosanitarios_domisanitarios_rows.json`** ("Soluciones Integrales", `anio_pago_registro` = 2026): con ella 0010 aborta. ¿Se borra en el servidor (si es de prueba) o se migra?
2. **Sacar ese JSON del repo** (`git rm`): es un dump de Ecodatos con `user_id` y coordenadas; el historial de git lo conserva.
3. **`formulario_id`** (y otras columnas de Ecodatos): si la plataforma lista los registros filtrando por `formulario_id`, los objetos que crea la botonera no aparecen. Lo define quien mantiene Ecodatos.
4. Opcional: `pg_dump -s -t public.fitosanitarios_domisanitarios -t public.tipos_fito_domi` de Ecodatos para regenerar `db/local/ecodatos-stub.sql` con el esquema real.

### Pendientes de esa revisión que NO se hicieron
- Limpieza de archivos huérfanos en Storage (suben antes de la transacción) en el cron.
- `consultarEstado` en el contrato de pagos (documentado como pendiente).
- Categoría distinta: home "Registros y certificados" vs `pagos.categorias` "Fitosanitarios".
- Aviso en el panel de técnicos si el DNI/CUIT de un alta ya tiene titular (con N representantes) antes de aprobar.
