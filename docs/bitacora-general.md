# Bitácora general — sesión del 2026-10-31

Resumen de lo trabajado con Claude Code. Cada módulo tiene además su bitácora/README propios
(`apps/api/src/modules/<módulo>/docs/`). El checklist para el servidor está en `docs/lunes.md`.

## Qué se hizo
1. **Módulo Registro de consultores** (`cons_*`, `/pagar/consultores`): primero se hizo sin histórico y se corrigió; quedó clon completo de
   fitosanitarios (titulares, vínculos, certificados, renovación, "Mis certificados", QR, avisos).
2. **Módulo Reservas privadas** (`res_*`, `/pagar/reservas`): clon de consultores. Tipo único provisorio `reserva-privada`; etiqueta =
   nombre de la reserva; documento que vence = libre deuda de inmobiliario. El usuario avisó que **su proceso real será distinto** (por ahora quedó igual).
3. **Mejoras del panel de técnicos** (en los 3 módulos): badge de solicitudes nuevas en "Primera vez / Renovaciones" (baja al "tomar"),
   refresco automático cada 30 s, pestaña "Certificado emitido", certificado visible (y PDF) dentro de la solicitud, botón "Volver" que
   siempre vuelve a la pantalla anterior.
4. **Página pública**: trámites en 3 columnas por categoría; se actualiza sola (cada 10 s) según módulos encendidos, aviso y mantenimiento.
5. **Administración del sistema** (`apps/sistema`, :5177, `/api/sistema`): solo admin/superadmin de Ecodatos. Módulos (encender/apagar: desaparece
   de la página y la API pública responde 404), Mantenimiento y avisos, Estado, Auditoría, Accesos.
6. **Logins**: todo contra Ecodatos. Panel de Recaudaciones: admin/superadmin o área `recaudaciones`. `ADMIN_SIN_LOGIN` eliminado.
7. **Migraciones nuevas**: 0012–0015 (consultores y reservas), 0016 (área Recaudaciones + RPC de estadísticas para Ecodatos), 0017 (`pagos.sistema_config`).

## Decisiones del dueño (nuevas)
- Cada módulo es **autónomo**: sin imports cruzados, se copia y adapta; solo lo transversal va en lo general.
- Apagar un módulo no borra nada; los paneles de técnicos y el QR de certificados ya emitidos siguen andando.
- Contaduría/Recaudaciones no ve lo técnico; los admins técnicos tienen su pantalla aparte.
- **No tocar la carpeta `ecodatos`** (se usa solo para ver la estructura). La pantalla de estadísticas dentro de Ecodatos queda para después;
  el RPC `public.recaudacion_estadisticas(p_desde, p_hasta)` ya está listo.
- Esquema `public` = Ecodatos (las migraciones las corre el dueño; no reescribir las ya aplicadas). Esquema `pagos` = nuevo, se puede cambiar.

## Decisiones abiertas
- Fila real de `fitosanitarios_domisanitarios_rows.json` que hace abortar la 0010 (¿borrar o migrar?). ¿`git rm` del JSON (dump con user_id)? `formulario_id` y columnas obligatorias de Ecodatos para que los objetos de la botonera aparezcan en su plataforma.
- Requisitos, tipos y tasas de consultores y reservas son **provisorios** hasta que cada área confirme.
- Proceso real de Reservas privadas (distinto al clonado).

## Pendiente
- **Pasarela de pagos** (lunes): ver `docs/lunes.md` §7.
- Pantalla de estadísticas dentro de Ecodatos.
- Probar todas las pantallas en el navegador y el login real de Ecodatos (no se pudo en la sesión).
- Ideas del sistema no hechas: sesiones/enlaces activos, reintento de avisos fallidos, vista de la config de cada trámite.

## Estado del repo
Nada está commiteado (rama `develop`). Datos de prueba en la base local: solicitudes CONS-/RES- de simulación.
