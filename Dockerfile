# Dos imágenes desde el mismo repo:
#   target "api"  -> la API (Express, corre con tsx; lee db/migrations al arrancar)
#   target "web"  -> nginx con los 4 fronts + la bandeja de mails, colgados de /pagos/, y el proxy de /pagos/api a la API
#
# Los VITE_* se "queman" en el JavaScript al compilar: se pasan como build args (ver docker-compose.yml).

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY apps/paneles/package.json apps/paneles/
COPY apps/sistema/package.json apps/sistema/
COPY apps/relevamiento/package.json apps/relevamiento/
COPY packages/shared/package.json packages/shared/
COPY packages/marca/package.json packages/marca/
RUN npm ci

# ---------- API ----------
FROM node:24-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY db/migrations ./db/migrations
# Carpeta del buzón de mails de prueba (volumen): tiene que ser escribible por el usuario node.
RUN mkdir -p /data/mail && chown node:node /data/mail
USER node
EXPOSE 3001
WORKDIR /app/apps/api
CMD ["/app/node_modules/.bin/tsx", "src/server.ts"]

# ---------- Fronts ----------
FROM deps AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Prefijo de la API que usan los fronts y pago simulado (1 = muestra el botón de pago de demostración).
ARG VITE_API_BASE=/pagos/api
ARG VITE_PAGO_SIMULADO=0
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_BASE=$VITE_API_BASE VITE_PAGO_SIMULADO=$VITE_PAGO_SIMULADO
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
# Cada front cuelga de su ruta bajo /pagos/ (dominio de ecodatos).
RUN VITE_BASE=/pagos/publico/         npm run build -w @botonera/web \
 && VITE_BASE=/pagos/recaudaciones/   npm run build -w @botonera/admin \
 && VITE_BASE=/pagos/tecnicos/        npm run build -w @botonera/paneles \
 && VITE_BASE=/pagos/administracion/  npm run build -w @botonera/sistema

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/seguridad.conf /etc/nginx/snippets/seguridad.conf
COPY --from=build /app/apps/web/dist      /usr/share/nginx/html/pagos/publico
COPY --from=build /app/apps/admin/dist    /usr/share/nginx/html/pagos/recaudaciones
COPY --from=build /app/apps/paneles/dist  /usr/share/nginx/html/pagos/tecnicos
COPY --from=build /app/apps/sistema/dist  /usr/share/nginx/html/pagos/administracion
COPY docker/404.html docker/50x.html /usr/share/nginx/html/pagos/
COPY docker/mail/index.html /usr/share/nginx/html/pagos/mail/index.html
EXPOSE 80
