# Checklist del lunes — migraciones y puesta a punto

Verificado el 2026-10-31 (17) y el 2026-11-16 (18): las migraciones corren **de cero** sobre una base limpia (con el stub de Ecodatos) y el
runner no repite las ya aplicadas. Lo que no se pudo probar acá es el servidor real (Ecodatos) y el login real.

## 1. Antes de migrar (en el servidor)
1. **Copia de la base** (o snapshot).
2. `select count(*) from public.fitosanitarios_domisanitarios;` — la 0010 **aborta si la tabla tiene filas** (hay una fila real
   en `fitosanitarios_domisanitarios_rows.json`). Decidir: borrarla o migrarla. Ver `docs/bitacora-general.md` → "Decisiones abiertas".
3. Ver qué migraciones ya corrieron allá: `select archivo from pagos._migraciones order by archivo;`
   (el runner aplica solo las pendientes).

## 2. Correr las migraciones
`npm run migrate` con `MIGRATIONS_DATABASE_URL` (rol `postgres`). Qué hace cada una y qué toca:

| Migración | Esquema | Qué hace |
|---|---|---|
| 0001–0011 | `pagos` + `public` (0006, 0010) | Fitosanitarios. 0006 da lectura de permisos al rol `botonera`; 0010 crea el registro en Ecodatos |
| 0012 | `pagos` | Consultores: solicitudes, documentos, sesiones, config, tasas mock |
| 0013 | **`public`** | Consultores: `cons_*` (titulares, vínculos, registro, certificados, vistas) |
| 0014 | `pagos` | Reservas privadas: lo mismo que 0012 |
| 0015 | **`public`** | Reservas privadas: `res_*` |
| 0016 | **`public`** | Área `recaudaciones` + funciones `recaudacion_puede_ver` y `recaudacion_estadisticas` (RPC para Ecodatos) |
| 0017 | `pagos` | `sistema_config` (mantenimiento y aviso) |
| 0018 | `pagos` | `ordenes_pago`: columnas `cuenta` y `referencia_externa` (pago online) |

Las que tocan `public` solo **agregan** (tablas/funciones/área nuevas). La única que cambia algo existente de Ecodatos es la
0010 (columna/trigger sobre `fitosanitarios_domisanitarios`). `pagos` es nuevo y se puede cambiar libremente.

Después: `select count(*) from pagos._migraciones;` debe dar **18**, y la API arranca (si falta alguna, no arranca y lo dice).

## 3. Ecodatos (a mano, desde su plataforma)
- Crear los formularios **`registro_consultores`** y **`registro_reservas_privadas`** (hoy los admin ven todos los paneles;
  los técnicos de cada área necesitan su formulario asignado). Fitosanitarios: `tipos_fito_domi` con comercio, vehículo, depósito, fraccionamiento.
- Asignar a la gente de Contaduría al área **Recaudaciones** (la crea la 0016).
- Revisar que haya al menos un usuario con rol `admin`/`superadmin` para entrar a la pantalla del sistema.

## 4. `.env` del servidor
`DATABASE_URL` (rol `botonera`), `MIGRATIONS_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (build de los fronts), `VERIFICACION_SECRETO` (≥32 caracteres),
`TRUST_PROXY=1`, `WEB_URL` (dirección pública), mail (`GMAIL_*` o `MS_*` + `MAIL_FROM`), `PAYMENT_PROVIDER=macroclick`.
**Sin** `EMISION_SIMULADA`, **sin** `AUTH_LOCAL`, **sin** `MAIL_PROVIDER=consola`: la API se niega a arrancar en producción con ellos.
`ADMIN_SIN_LOGIN` ya no existe. Se puede verificar todo en la pantalla **Estado** del sistema (alertas en rojo).

## 5. Qué publicar (`npm run build`) — Docker armado: ver `docs/despliegue-docker.md`
Cuatro fronts estáticos + la API: `apps/web` (público), `apps/admin` (Recaudaciones, login Ecodatos), `apps/paneles` (técnicos),
**`apps/sistema` (nuevo: administración técnica, solo admin/superadmin de Ecodatos)**. Dev: 5173 / 5174 / 5176 / 5177. Los cuatro llaman a `/api` (proxy a la API :3001).
Conviene que `sistema` quede en una dirección no enlazada desde ningún lado.

## 6. Cron diario (uno por módulo)
`npm run fitosanitarios:tareas`, `npm run consultores:tareas`, `npm run reservas:tareas` (avisos de vencimiento y limpieza) y, con la pasarela real, **`npm run pagos:conciliar`** (cierra órdenes abandonadas y rescata pagos con aviso perdido; sale con código 1 si el banco no responde; ver `docs/pasarelas.md`).

## 7. Pasarela de pagos (estado real, 2026-11-16)
Ya está hecho (ver `docs/pasarelas.md`): formulario firmado verificado con un pago real de sandbox, rutas de pagar (por trámite y por lote), aviso del banco
con reconfirmación, retorno, conciliación diaria, alertas en Estado del sistema, y la API no arranca en producción si una cuenta está incompleta.
**Lo que falta para cobrar de verdad** (depende del banco o de ustedes):
1. Que el banco **habilite la consulta de transacciones** (hoy responde 403): sin eso el sistema no puede confirmar pagos y los deja pendientes a propósito.
2. En el `.env` del servidor: `PAYMENT_PROVIDER=macroclick`, los datos de cada cuenta (`PAGOS_<CUENTA>_*`, ver `.env.example`), un `WEBHOOK_TOKEN` distinto por cuenta, y `PAGOS_CUENTA_<MODULO>`.
3. Cargar en el panel del banco la URL de aviso de cada cuenta: `https://<dominio>/pagos/api/pagos/webhook/<CUENTA>/<token>`.
4. Poner `npm run pagos:conciliar` en el cron diario.
5. Migración 0018 aplicada.

## 8. Después de migrar: verificar
- Pantalla **Estado** del sistema sin alertas rojas; "Migraciones aplicadas 18 de 18".
- Entrar a cada panel con un usuario real (admin y uno de Recaudaciones).
- Apagar y encender un módulo desde el sistema y ver que desaparece de la página pública.
- Recorrer las pantallas en el navegador: **solo se probó compilando y contra la API**.
