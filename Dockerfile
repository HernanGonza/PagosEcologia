# Dos imágenes desde el mismo repo:
#   target "api"  -> la API (Express, corre con tsx; lee db/migrations al arrancar)
#   target "web"  -> nginx con los 4 fronts compilados + proxy de /api a la API
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
USER node
EXPOSE 3001
WORKDIR /app/apps/api
CMD ["node_modules/.bin/tsx", "src/server.ts"]

# ---------- Fronts ----------
FROM deps AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
# El público cuelga de "/" y los demás de su ruta. Con dominio propio por app se puede pasar VITE_BASE=/ a todos.
RUN VITE_BASE=/          npm run build -w @botonera/web \
 && VITE_BASE=/admin/    npm run build -w @botonera/admin \
 && VITE_BASE=/paneles/  npm run build -w @botonera/paneles \
 && VITE_BASE=/sistema/  npm run build -w @botonera/sistema

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist      /usr/share/nginx/html
COPY --from=build /app/apps/admin/dist    /usr/share/nginx/html/admin
COPY --from=build /app/apps/paneles/dist  /usr/share/nginx/html/paneles
COPY --from=build /app/apps/sistema/dist  /usr/share/nginx/html/sistema
EXPOSE 80
