# Despliegue con Docker (sobre la IP, sin dominio)

Armado el 2026-11-05. **No se probó el build de las imágenes** (no había Docker en la máquina de desarrollo): lo primero
mañana es `docker compose build` y corregir lo que salga. Sí se verificó `npm run build` (4 fronts + typecheck de la API).

## Qué hay
| Archivo | Para qué |
|---|---|
| `Dockerfile` | target `api` (Express con tsx, lleva `db/migrations`) y target `web` (nginx con los 4 fronts) |
| `docker/nginx.conf` | `/` público · `/admin/` Recaudaciones · `/paneles/` · `/sistema/` · `/api/` → contenedor `api:3001` |
| `docker-compose.yml` | producción: `NODE_ENV=production`, `TRUST_PROXY=1`, puerto 80 |
| `docker-compose.prueba.yml` | modo prueba sin pasarela: `NODE_ENV=staging`, `PAYMENT_PROVIDER=mock`, `EMISION_SIMULADA=1` |
| `.dockerignore` | deja afuera `.env`, `node_modules`, `dist`, docs |

Los fronts usan `VITE_BASE` (ruta donde cuelgan) y `BrowserRouter basename={import.meta.env.BASE_URL}`. En dev la base es `/`.
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` se queman en el JS al compilar (build args tomados del `.env`).

## Checklist de mañana
1. Server con Docker + plugin compose, puerto 80 abierto, y que llegue a `10.0.0.231:5432` y a la URL de Supabase.
   Los navegadores de quienes usen admin/paneles/sistema también tienen que llegar a `VITE_SUPABASE_URL` (login directo a Ecodatos).
2. Migraciones: `select count(*) from pagos._migraciones;` debe dar 17 (ver `docs/lunes.md` §1-2; la 0010 aborta si
   `fitosanitarios_domisanitarios` tiene filas). Sin las 17 la API no arranca.
3. `.env` del server (no el de desarrollo): `WEB_URL=http://<IP>`, `DATABASE_URL` (rol botonera), `SUPABASE_*`, `VITE_SUPABASE_*`,
   `VERIFICACION_SECRETO` (≥32), mail real (`GMAIL_*` o `MS_*` + `MAIL_FROM`). **Sin** `AUTH_LOCAL`, `MAIL_PROVIDER=consola`
   ni `ADMIN_SIN_LOGIN`. El `.env` local actual tiene `MAIL_PROVIDER=consola`: no sirve tal cual.
4. Levantar (mientras no haya pasarela, con el modo prueba):
   `docker compose -f docker-compose.yml -f docker-compose.prueba.yml up -d --build`
5. Verificar: `http://<IP>/api/health`, pantalla Estado en `/sistema/`, y entrar a `/admin/` y `/paneles/` con usuarios reales.
6. Cron diario en el host:
   `docker compose exec -T api npm run fitosanitarios:tareas` (idem `consultores:tareas`, `reservas:tareas`).

## Ojo
- **Modo prueba = inseguro**: la ruta `dev/emitir` permite emitir certificados sin pagar y el CORS queda abierto. Solo red
  interna y datos de prueba. Estado del sistema no avisa en este modo (solo marca en `production`).
- **Sin HTTPS**: las cookies van sin `Secure` y las contraseñas en claro. Con dominio: TLS y `WEB_URL=https://…`.
- **Producción real** exige `PAYMENT_PROVIDER=macroclick` y `core/payments/macroclick.ts` está vacío (ver `docs/lunes.md` §7).
- Con subdominios por app en vez de rutas: `VITE_BASE=/` en los 4 builds y partir el nginx.
