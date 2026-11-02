# Módulo registro de consultores — documentación

**Módulo autónomo**: no importa nada de otros módulos ni comparte tablas con ellos (salvo lo del núcleo:
`pagos.verificaciones_email`, `core/correo`, `core/storage`, `core/auth-ecodatos`, `pagos.modulos/tarifas/auditoria`).
Es el **mismo diseño que fitosanitarios**, con tablas, rutas, tipos y pantallas propias. Si se arregla un bug en uno,
hay que mirar el otro. El diseño detallado (titulares, vínculos, certificados, renovación, QR, seguridad de los
enlaces) está explicado en `apps/api/src/modules/fitosanitarios/docs/` y vale igual acá, cambiando los nombres.

## Estado
**Terminado y probado en la base local** (2026-10-31). Nada commiteado ni corrido en el servidor. **El pago NO está implementado** (igual que en fito).

Funciona de punta a punta:
- Alta: tipo → mail con código → datos y documentos (con vencimiento) → enviar → panel (tomar, observar, aprobar, rechazar).
- Al aprobar el técnico: se crea (o reconoce por DNI/CUIT) el **titular** y se **vincula el mail**; varios representantes por titular, poder firmado.
- Emisión del **certificado** (12 meses) con PDF y **QR de verificación** pública. Hoy solo con `EMISION_SIMULADA=1` (desarrollo): `POST /api/consultores/dev/emitir/<número>`.
- **"Mis certificados"** (`/pagar/consultores/mis-certificados`): con el mail verificado, la persona ve a qué titulares representa, sus certificados, vencimientos e historial, descarga el PDF y pide bajas.
- **Renovación** (uno o varios a la vez), dentro de la ventana −30/+30 días. Precarga los datos y los documentos; si no cambia nada y nada venció, se aprueba sola; si no, la revisa un técnico. Anticipada vale desde el vencimiento anterior; tardía, desde la emisión.
- **Histórico**: cada certificado queda en `public.cons_certificados` (no se pisa ni se borra, solo se revoca); el registro guarda el vencimiento vigente.
- Panel: buscador y ficha de titulares (cada consulta queda auditada), revocar certificados, resolver bajas de representantes.
- Avisos de vencimiento por mail (30 y 7 días antes y al vencer) y limpieza: `npm run consultores:tareas` (cron diario).

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| API | `apps/api/src/modules/consultores/` → montada en `/api/consultores` (`server.ts`) |
| Tipos compartidos | `packages/shared/src/consultores/` (se usan como `consultores.X` desde `@botonera/shared`) |
| Pantalla pública | `apps/web/src/modules/consultores/` → `/pagar/consultores` |
| Panel de técnicos | `apps/paneles/src/modules/consultores/` → `/consultores` |
| Migraciones | `db/migrations/0012_consultores.sql` (lado `pagos`: solicitudes, documentos, sesiones, avisos, config, tasas) y `0013_consultores_registro.sql` (**Ecodatos `public`**: titulares, vínculos, tipos, registro, certificados) |

Puntos de registro fuera del módulo (inevitables): `server.ts`, `apps/web/src/main.tsx` y `modules/registry.ts`,
`apps/paneles/src/modules/registry.ts`, `packages/shared/src/index.ts`, ícono en `Icono.tsx`, formulario en `db/local/ecodatos-stub.sql`, scripts `consultores:tareas` en los `package.json`.

## Diferencias con fitosanitarios
- El registro es una tabla **nueva** (`public.cons_registro`); no modifica ninguna tabla existente de Ecodatos (la 0013 no tiene chequeos previos ni `drop column`).
- Hay un catálogo propio `public.cons_tipos` (slug `persona-fisica` / `persona-juridica`) en vez de `tipos_fito_domi`.
- La "etiqueta" que identifica la inscripción es el **número de matrícula**; el documento que vence es la **constancia de matrícula** (en fito, la VTV).
- Certificados: `CERT-CONS-AAAA-NNNNNN`. Solicitudes: `CONS-AAAA-NNNNNN`.

## Provisorio (lo confirma el área)
- Tipos, requisitos y tasas mock (`inscripcion-persona-fisica`, `inscripcion-persona-juridica`). Para cambiar los requisitos: migración nueva que actualice `modulos.config`; los tipos nuevos además se dan de alta en `public.cons_tipos`.
- Quién revisa: `config.panel.formularios = ["registro_consultores"]`. **Ese formulario hay que crearlo en Ecodatos** y asignarlo a los técnicos (los admin ven todos los paneles).
- `formulario_id` y otras columnas que Ecodatos pida para listar el registro desde su plataforma: como `cons_registro` es nueva, **la define quien mantiene Ecodatos** (podría convenir sumar esas columnas a 0013).
- Diseño del PDF, retención del registro de consultas, mail al resolver una baja.

## Para dejarlo andando
1. `npm run migrate` (0012 y 0013). La 0013 toca `public`: la corre quien mantiene Ecodatos.
2. Crear el formulario `registro_consultores` en Ecodatos y asignarlo a los técnicos.
3. `.env`: mismas variables que fitosanitarios (`VERIFICACION_SECRETO`, `TRUST_PROXY`, `WEB_URL`). **Sin** `EMISION_SIMULADA`.
4. Cron diario: `npm run consultores:tareas`.
5. Recorrer las pantallas en el navegador (`npm run dev`): solo se probó compilando y contra la API.

## Falta
- **El pago** (MacroClick): llamar a `emitirCertificado`, guardar `orden_id`, mail de emitido. Igual que fito.
- Probar todo en el navegador.

## Cómo probar localmente
`npm run dev` (Postgres local + API + fronts; los mails salen por consola, ahí está el código). Con `EMISION_SIMULADA=1`,
`POST /api/consultores/dev/emitir/<número de solicitud aprobada>` simula el pago y emite. Para ver una renovación sin esperar
un año, ampliar `renovacion.anticipacionDias` en `pagos.modulos.config` de la base local.
