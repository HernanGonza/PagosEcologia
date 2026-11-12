# Revisión de seguridad y robustez (antes de la demo)

## Corregido
- **Sesión mezclada entre solicitudes**: `conSesion` usaba siempre la solicitud de la cookie aunque el front pidiera otra (X-Solicitud). Ahora se resuelve la solicitud pedida solo si pertenece a la persona.
- `dev/emitir` solo responde a pedidos locales (sin `X-Forwarded-For`); desde afuera, 404.
- Pago simulado y bandeja de mails solo existen con `EMISION_SIMULADA=1` y `NODE_ENV!=production`.
- Subida de documentos: se autentica **antes** de leer el cuerpo.
- `limite`/`offset` acotados en paneles y admin; fechas de `/ordenes` validadas (400).
- `bloquear` con id que no es uuid → 404 (antes 500).
- API: sin `x-powered-by`; 404 JSON; JSON malformado → 400; muy grande → 413; errores internos sin detalle.
- 404 propio en la web (`NoEncontrada.tsx`), `docker/404.html` y `docker/50x.html`; la API caída devuelve JSON 503.
- nginx: `absolute_redirect off` y redirecciones de `/pagos/publico` (etc.) sin barra final.

## Recomendado (después de la demo)
- CSP y HSTS en el nginx de ecodatos.
- `CORS_ORIGINS` explícito en producción (WEB_URL tiene path).
- Verificar la IP real que ve la API: `select ip, count(*) from pagos.verificaciones_email group by 1;` (si sale una sola IP, ajustar TRUST_PROXY).
- `persona/salir` no vence la cookie del lado del cliente (menor).
- Producción: sacar `docker-compose.prueba.yml` de COMPOSE_FILE.

## No probado
nginx no se pudo probar localmente (no hay nginx/docker): revisar con `docker compose exec web nginx -t` en el server.
