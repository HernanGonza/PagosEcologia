# Módulo fitosanitarios y domisanitarios — documentación

| Documento | Para qué sirve |
|---|---|
| [`bitacora.md`](bitacora.md) | **Empezá por acá.** Qué se hizo, qué se decidió, qué falta y cómo retomar. |
| [`mails-y-seguridad.md`](mails-y-seguridad.md) | Acceso sin cuenta: códigos, enlaces de un solo uso, sesiones, mails, protecciones y límites. |
| [`titulares-y-certificados.md`](titulares-y-certificados.md) | Titulares, vínculos, certificados, renovación, QR, migraciones del registro y lo construido. |

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| API del módulo | `apps/api/src/modules/fitosanitarios/` (este directorio) |
| Tareas diarias (avisos, vencimientos) | `tareas.ts` → `npm run fitosanitarios:tareas` |
| Tipos compartidos del módulo | `packages/shared/src/fitosanitarios/` |
| Pantalla pública (trámite, "Mis certificados", verificación del QR) | `apps/web/src/modules/fitosanitarios/` |
| Panel de técnicos | `apps/paneles/src/modules/fitosanitarios/` |
| Migraciones | `db/migrations/` (una sola carpeta para todos los módulos; las del módulo son 0002 y 0004 a 0011) |

**Lo general** (editar tasas en el panel financiero, `pedirTexto` de los paneles, verificación de mail, correo, storage, auth de Ecodatos, el runner de migraciones y la base local) vive fuera del módulo, en `apps/api/src/core`, `apps/api/src/routes`, `apps/admin`, `apps/paneles/src/lib` y `scripts/`.
