# 💳 Botonera de pagos

<p>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white">
</p>

> Este README es el documento vivo del proyecto (plan, arquitectura y estado). Se actualiza junto con el código.

Botonera para que el público pague desde la página del Ministerio de Ecología todo lo que el ministerio cobra. Incluye backend, panel de administración y front.

## 🧰 Tecnologías

| Capa | Tecnología |
|---|---|
| Monorepo | npm workspaces |
| Lenguaje | TypeScript (en todo el repo) |
| Front (`apps/web`) | React 19, Vite, React Router 6, Tailwind v4, shadcn + [Watermelon UI](https://ui.watermelon.sh), motion, lucide-react |
| Panel (`apps/admin`) | React 19, Vite, Tailwind v4, shadcn + Watermelon UI, recharts |
| Marca (`packages/marca`) | Oak Sans, paleta y logos del Brandbook 2024, compartidos por todas las apps |
| Back (`apps/api`) | Node.js, Express 5, `pg` (conexión directa a Postgres), `cors` |
| Código compartido (`packages/shared`) | Tipos TypeScript compartidos entre front y back |
| Base de datos | PostgreSQL, en el Supabase self-hosted de Ecodatos |
| Migraciones | Archivos SQL en `db/migrations/` |
| Pagos | MacroClick, detrás de una interfaz de proveedor (hoy hay un `mock`) |
| Relevamiento (`apps/relevamiento`) | Express + SQLite local + React (herramienta aparte, solo local) |
| Desarrollo | `tsx` (API con recarga automática), Vite (front) |

## 🔌 Conexión a Supabase (Ecodatos)

La base de la botonera va a vivir en el **Supabase self-hosted de Ecodatos**, el otro sistema del ministerio. Usamos un schema propio (`pagos`) dentro de esa instancia, separado de los datos de Ecodatos.

- La API se conecta directo a Postgres con `pg`, usando la variable `DATABASE_URL` del `.env`.
- El front nunca habla con Supabase: todo pasa por la API. El schema no se expone en PostgREST y tiene RLS activado por prevención.
- Las credenciales no están en el repo. Cada quien arma su `.env` a partir de `.env.example` y las pide al dueño del proyecto.
- Las migraciones de `db/migrations/` las corre el dueño del proyecto con `npm run migrate` (rol `postgres`, `MIGRATIONS_DATABASE_URL`). Quedan registradas en `pagos._migraciones`.
- La API entra con el rol `botonera` (`DATABASE_URL`): escribe en `pagos` y en `public` solo lee `fitosanitarios_domisanitarios` / `tipos_fito_domi` y actualiza `anio_pago_registro`. También lee las tablas de permisos de Ecodatos (`areas`, `formularios`, `usuarios_areas`, `usuarios_formularios`, `roles`, `usuarios_rol`, `profiles`) para saber quién entra a cada panel de área (`0006_permisos_ecodatos.sql`).
- **Storage:** los documentos de las solicitudes van a buckets privados del mismo Supabase (`fitosanitarios`, creado en `0005`). Solo la API sube y firma enlaces, con `SUPABASE_SERVICE_ROLE_KEY`; esa clave nunca va a un front.
- **Auth:** los paneles de área (`apps/paneles`) usan el login de Ecodatos (Supabase Auth, mail y contraseña) con la anon key, que es pública. La API valida cada token contra Supabase y calcula los permisos.

### 🏠 Trabajar sin la red del ministerio

`npm run dev` (o `dev:api`, `dev:web`, `dev:admin`, `dev:paneles`) elige solo contra qué base trabajar: si llega al Postgres de Ecodatos del `.env`, usa Ecodatos; si no, levanta un **Postgres local de pruebas** y apunta todo ahí. Se fuerza con `DB_MODE=local` o `DB_MODE=ecodatos`.

- El Postgres local es un cluster propio en `.local/` (ignorado por git, puerto 54329); no toca el del sistema. Necesita los binarios de PostgreSQL instalados (o `PG_BIN`).
- Como Ecodatos no está, `db/local/ecodatos-stub.sql` crea una copia mínima de lo que la botonera lee de ahí (registro de fitosanitarios, permisos, `storage.buckets`) y después corren las migraciones de siempre. El registro se siembra con `fitosanitarios_domisanitarios_rows.json`.
- Storage va a disco (`.local/storage`, `STORAGE_LOCAL_DIR`) y los paneles entran sin login como un usuario de pruebas superadmin (`AUTH_LOCAL`, que solo se respeta si `DATABASE_URL` es local). Los mails salen por consola.
- `npm run db:local` solo prepara la base; `-- stop` la apaga y `-- reset` la rearma de cero.

## 🏗️ Arquitectura

**Un solo front, con módulos como plugins.** El 90% del circuito es igual (identificar al contribuyente, ver el monto, pagar, recibir comprobante). Cambian los datos que se piden y cómo se calcula el monto.

| Tipo de módulo | Cómo se define | Ejemplo |
|---|---|---|
| Simple | Solo configuración en la base: campos, monto fijo o fórmula. Sin código. | Tasa de trámite con monto fijo |
| Con consulta | Configuración más un "resolver" en el back que valida al contribuyente en un registro (por CUIT) o busca la deuda (por acta, CUIT, etc.). | Emisión de certificado (registro de transportistas), multa por apeo ilegal |
| Complejo | Componente React propio y rutas propias en el back. | Fitosanitarios, con certificados y flujo propio |

Un módulo nuevo no toca el resto del sistema.

### 📁 Estructura

```
botonera-pagos/
├─ apps/
│  ├─ web/            botonera pública: home + /pagar/<slug>
│  │  └─ src/modules/<slug>/   pantalla de cada trámite
│  ├─ admin/          panel de Recaudaciones
│  ├─ paneles/        paneles de área (técnicos), con el login de Ecodatos
│  │  └─ src/modules/<slug>/   panel de cada trámite que lo necesita
│  ├─ api/            Node + Express + TypeScript
│  │  └─ src/modules/<slug>/   endpoints de cada trámite
│  └─ relevamiento/   herramienta local de relevamiento
├─ packages/
│  ├─ shared/         tipos compartidos front/back (contrato de los trámites)
│  └─ marca/          fuentes, paleta y logos del ministerio
└─ db/migrations/ SQL del schema "pagos"
```

- Monorepo con npm workspaces. **Todos los módulos viven en este mismo repo**, no hay un repo por módulo: el back en `apps/api/src/modules/<slug>/` y, si es complejo, su componente en `apps/web/src/modules/<slug>/`.
- El panel de Recaudaciones es una app aparte (`apps/admin`). Los paneles de cada área (los técnicos que revisan solicitudes) son otra (`apps/paneles`): ver [Paneles de área](#-paneles-de-área-appspaneles).
- Backend: `core/` (pagos, comprobantes, auth, proveedor de pago) y una carpeta `modules/<slug>/` por proceso, con su definición, resolver de deuda, validaciones y hooks.
- Front: la home dibuja los botones desde `apps/web/src/modules/registry.ts` y cada `/pagar/<slug>` tiene su pantalla. Más adelante, la home va a leer `GET /api/modulos` y los trámites simples van a usar un formulario generado desde la config.

### 🧩 Cómo se hacen los módulos

**Un módulo no es una app Vite+React aparte.** Hay un solo front público (`apps/web`) y una sola API (`apps/api`); un módulo es una migración, una carpeta en la API y una carpeta en el front que se enchufan en ellos. Todo vive en este repo, sin repo ni build por módulo.

La idea a futuro es que un trámite **simple** sea solo configuración (una fila en `pagos.modulos`) y lo dibuje un formulario genérico. **Eso todavía no existe**: hoy cada módulo lleva migración, API y componente propio, como `fitosanitarios`. El paso a paso está en [Cómo crear un módulo nuevo](#-cómo-crear-un-módulo-nuevo-paso-a-paso).

### 🌿 Flujo de ramas

Trabajamos **una rama por módulo**, salidas de `develop`:

- Nombre: `modulo/<slug>` (por ejemplo `modulo/multas-apeo-ilegal`).
- Cada módulo se desarrolla en su rama (migración, back y front si corresponde) y se mergea a `develop` cuando está terminado.
- Cambios al núcleo (`core/`, `packages/shared`, este README) van en ramas aparte (`core/<tema>`), para que no se mezclen con un módulo.
- Antes de empezar una rama y antes de mergear a `develop`, traer lo último de `develop`.
- `develop` es la rama de trabajo: ahí se junta todo lo que se va terminando.
- `main` es la rama de **despliegue**. Cuando `develop` está estable, se pasa a `main` y de ahí sale lo que se publica. No se trabaja directo en `main`.

### 🗄️ Schema `pagos` (núcleo)

- `modulos`: slug, nombre, ícono, categoría, orden, activo, tipo, configuración (jsonb)
- `categorias`: agrupan los botones
- `ordenes_pago`: la deuda o intención de pago (módulo, CUIL/CUIT validado, monto, estado, referencia al objeto del módulo)
- `pagos`: intentos y confirmaciones del proveedor, con payload crudo
- `tarifas`: valores de cada trámite con vigencia (versionadas); la orden guarda la versión usada
- `comprobantes`
- `conciliaciones`: cruce de pagos con MacroClick y banco, con diferencias y notas
- `auditoria`
- `usuarios_admin` y `roles`, con permisos por módulo (único login del sistema: el del panel)

Cada módulo suma sus propias tablas con prefijo (`apeo_actas`, `fito_certificados`, …). Una `orden_pago` apunta al registro del módulo con `modulo_slug` + `ref_id`.

### 📌 Decisiones fijadas

1. El front nunca habla con la base. Todo pasa por la API, que se conecta por `pg` directo, sin exponer el schema en PostgREST. RLS activado igual, por prevención.
2. Proveedor de pago como interfaz (`crearPago`, `webhook`, `consultarEstado`). Ningún módulo conoce al proveedor.
3. **Sin login para el público.** Quien entra a pagar no crea cuenta ni inicia sesión. Cuando el trámite lo exige, se identifica con su CUIT/CUIL y el módulo lo valida contra un registro (ver [Acceso sin login](#-acceso-sin-login)). El login existe solo para el panel `/admin`.
4. Montos y estados se calculan y validan solo en el back. El front nunca manda un monto.
5. Webhooks idempotentes y conciliación diaria (es plata pública).
6. Las migraciones quedan como archivos SQL; las corre el dueño del proyecto. No se toca el Supabase desde acá.

## 🧱 Cómo crear un módulo nuevo (paso a paso)

Guía para sumar un trámite a la botonera. El ejemplo de referencia es `fitosanitarios`: ante la duda, mirá cómo está hecho ahí.

> **Qué hay hoy y qué no.** Hoy cada módulo tiene migración, rutas propias en la API y pantalla propia en el front. Todavía **no existen** el formulario genérico para trámites simples, el endpoint común `POST /api/modulos/:slug/validar`, el CAPTCHA, ni la creación de órdenes contra MacroClick (el pago de `fitosanitarios` es una demostración). Cuando se agreguen, esta guía se actualiza.

### Resumen: qué se toca

| # | Dónde | Qué | ¿Obligatorio? |
|---|---|---|---|
| 1 | `db/migrations/NNNN_<slug>.sql` | Categoría, fila en `pagos.modulos` con su `config`, tablas propias, permisos y RLS | Sí |
| 2 | `apps/api/src/modules/<slug>/index.ts` | Router de Express con los endpoints del trámite | Sí |
| 3 | `apps/api/src/server.ts` | Montar el router en `/api/<slug>` | Sí |
| 4 | `apps/web/src/modules/<slug>/index.tsx` | Pantalla del trámite | Sí |
| 5 | `apps/web/src/modules/registry.ts` | Ficha del botón en la home | Sí |
| 6 | `apps/web/src/main.tsx` | Ruta `/pagar/<slug>` | Sí |
| 7 | `packages/shared/src/` | Tipos que comparten front y back | Si hace falta |
| 8 | `apps/paneles/src/modules/<slug>/` + `config.panel` | Panel del área que revisa las solicitudes | Solo si el trámite tiene revisión técnica |
| — | `apps/admin` | **Nada.** El panel lo toma solo de la base | — |

### El slug

Antes de escribir código, elegí el **slug**: identificador corto, en minúsculas, con guiones y sin tildes (`guia-transito-forestal`, `multa-apeo`). Tiene que ser **exactamente el mismo** en todos lados:

- `pagos.modulos.slug`, `pagos.tarifas.modulo_slug` y `pagos.ordenes_pago.modulo_slug`
- la carpeta `apps/api/src/modules/<slug>/` y la ruta `/api/<slug>`
- la carpeta `apps/web/src/modules/<slug>/`, la ruta `/pagar/<slug>` y la entrada en `registry.ts`

Si no coinciden, el panel no asocia los pagos al trámite.

### Paso 0 · Rama y relevamiento

1. Traé lo último de `develop` y abrí la rama: `git checkout develop && git pull && git checkout -b modulo/<slug>`.
2. Tené a mano la ficha del proceso de la herramienta de relevamiento (`npm run dev:relevamiento`). De ahí salen las respuestas a estas preguntas:

| Pregunta | Dónde va |
|---|---|
| ¿Qué datos se le piden a la persona? (CUIT, nº de acta, cantidad de m³…) | `config.campos` |
| ¿Tiene que figurar en algún registro, o tener una deuda? ¿En qué tabla? | `config.requisito` |
| ¿Cómo se calcula el monto? ¿Fijo, por fórmula, por escala o es el de la deuda? | `config.monto` |
| ¿Qué valores tiene hoy y desde cuándo rigen? | Tarifas (las carga Recaudaciones, o la migración si ya hay un valor oficial) |
| ¿Hay que leer o modificar tablas de Ecodatos (`public`)? ¿Qué columnas? | Permisos en la migración |
| ¿Qué se guarda de cada pago además de la orden? | Tablas propias `pagos.<prefijo>_…` |

### Paso 1 · Migración

Creá `db/migrations/NNNN_<slug>.sql` con el número siguiente al último (hoy el último es `0004`). Las migraciones corren en orden alfabético, una sola vez cada una, y quedan registradas en `pagos._migraciones`.

> ⚠️ **Nunca edites una migración que ya se aplicó**: no vuelve a correr. Para corregir algo, hacé una migración nueva.

Plantilla comentada:

```sql
-- Módulo: <nombre del trámite>. <Qué hace, de dónde lee y qué guarda.>

-- 1) Categoría (agrupa los botones). Si ya existe, no hace nada.
insert into pagos.categorias (slug, nombre, orden)
values ('forestal', 'Forestal', 2)
on conflict (slug) do nothing;

-- 2) El trámite. `config` sigue ConfigModulo (packages/shared/src/contrato.ts).
--    tipo: 'simple' | 'consulta' | 'complejo'.
insert into pagos.modulos (slug, nombre, descripcion, icono, categoria_slug, tipo, orden, config)
values ('guia-transito-forestal', 'Guía de tránsito forestal', 'Pagá la guía para transportar madera', 'truck',
        'forestal', 'consulta', 1,
        '{
          "campos": [
            { "name": "cuit", "label": "CUIT", "type": "text", "required": true },
            { "name": "m3",   "label": "Metros cúbicos", "type": "number", "required": true }
          ],
          "requisito": { "tipo": "registro", "registro": "transportistas", "campo": "cuit" },
          "monto": { "tipo": "formula", "base": "tasa-base", "porCampo": [{ "campo": "m3", "concepto": "valor-m3" }] }
        }'::jsonb)
on conflict (slug) do update set
  nombre = excluded.nombre, descripcion = excluded.descripcion, icono = excluded.icono,
  categoria_slug = excluded.categoria_slug, tipo = excluded.tipo, config = excluded.config;

-- 3) Tablas propias, siempre en `pagos` y con prefijo del módulo.
--    Apuntan a la orden; la orden apunta acá con modulo_slug + ref_id.
create table pagos.guia_emisiones (
  id          bigint generated always as identity primary key,
  orden_id    bigint not null unique references pagos.ordenes_pago(id),
  cuit        text not null,
  m3          numeric not null,
  created_at  timestamptz not null default now()
);

-- 4) RLS: OBLIGATORIO en cada tabla nueva. Sin política, la API (rol botonera)
--    no ve ninguna fila y no puede insertar.
alter table pagos.guia_emisiones enable row level security;
create policy botonera_api on pagos.guia_emisiones
  for all to botonera using (true) with check (true);

-- 5) Solo si el módulo lee o modifica tablas de Ecodatos (public): lo mínimo,
--    columna por columna, con su política (esas tablas también tienen RLS).
-- grant select on public.transportistas to botonera;
-- grant update (vencimiento) on public.transportistas to botonera;
-- create policy botonera_lectura on public.transportistas for select to botonera using (true);
-- create policy botonera_actualiza on public.transportistas for update to botonera using (true) with check (true);

-- 6) Opcional: valor inicial de las tarifas, solo si hay un valor oficial.
--    `valor` va en CENTAVOS (o tramos para 'escala'). Si no, se carga desde el panel.
-- insert into pagos.tarifas (modulo_slug, concepto, valor, vigente_desde, creado_por)
-- values ('guia-transito-forestal', 'tasa-base', '150000'::jsonb, '2026-11-01', 'migracion');
```

Sobre la `config`:

- **`campos`**: lo que se pide en pantalla. `type` es `text`, `number` o `select` (con `options`).
- **`requisito`**: `{ "tipo": "ninguno" }` (libre), `registro` (debe figurar en un registro) o `deuda` (se busca una deuda). Ver [Contrato de un trámite](#-contrato-de-un-trámite).
- **`monto`**: `fijo`, `formula`, `escala` o `deuda`. **Nunca lleva números**: cada `concepto` es un nombre (`tasa-base`, `valor-m3`) cuyo valor vive en `pagos.tarifas`. Usá nombres en minúsculas con guiones y escribilos igual en la `config`, en las tarifas y en el código.
- Se pueden agregar claves propias del módulo (como `validez_dias` en fitosanitarios), siempre que `campos`, `requisito` y `monto` estén.

Para aplicarla: la corre **el dueño del proyecto** con `npm run migrate`, que usa `MIGRATIONS_DATABASE_URL` (rol `postgres`). La API nunca corre migraciones. Pasale el archivo y avisá qué toca de `public`, si toca algo.

### Paso 2 · API

Creá `apps/api/src/modules/<slug>/index.ts` con un `Router` de Express. Ejemplo mínimo:

```ts
import { Router } from 'express';
import { pool } from '../../db.js';

export const guiaTransitoRouter = Router();

// Valor vigente de un concepto (centavos). Rige la última tarifa con vigente_desde <= hoy.
async function tarifaVigente(concepto: string) {
  const r = await pool.query(
    `select id, valor from pagos.tarifas
      where modulo_slug = 'guia-transito-forestal' and concepto = $1 and vigente_desde <= current_date
      order by vigente_desde desc, id desc limit 1`,
    [concepto],
  );
  return r.rows[0] as { id: string; valor: number } | undefined;
}

guiaTransitoRouter.get('/cotizar', async (req, res, next) => {
  try {
    const m3 = Number(req.query.m3);
    if (!Number.isFinite(m3) || m3 <= 0) {
      res.status(400).json({ error: 'Ingresá una cantidad de metros cúbicos válida.' });
      return;
    }
    const [base, porM3] = await Promise.all([tarifaVigente('tasa-base'), tarifaVigente('valor-m3')]);
    if (!base || !porM3) {
      res.status(503).json({ error: 'El valor de este trámite todavía no está configurado.' });
      return;
    }
    res.json({ importe_centavos: base.valor + porM3.valor * m3 });
  } catch (error) {
    next(error);
  }
});
```

Y montalo en `apps/api/src/server.ts`:

```ts
import { guiaTransitoRouter } from './modules/guia-transito-forestal/index.js';
// ...
app.use('/api/guia-transito-forestal', guiaTransitoRouter);
```

Reglas del back (no son opcionales):

- **El monto se calcula acá**, con las tarifas de la base. El front nunca manda un monto ni un número de tarifa.
- **Consultas siempre parametrizadas** (`$1`, `$2`). Nunca armar SQL concatenando lo que manda el usuario.
- **Validar formato** de cada dato (largo, dígitos, CUIT con dígito verificador) y responder `400` con un mensaje claro en castellano.
- **Datos mínimos**: si el trámite consulta un registro, devolver solo lo necesario para que la persona confirme (razón social, estado). Nunca domicilio, teléfono ni documentos.
- **Si falta algo de configuración** (tarifa sin cargar, columna que el área todavía no agregó), responder `503` con un mensaje, no inventar valores.
- Si el módulo escribe en `public`, que sea solo en las columnas que le dio la migración, y dejando registro en su tabla propia (qué había antes y qué quedó), como `pagos.fito_renovaciones`.
- Endpoints que cambian datos van por `POST`; los de consulta, por `GET`.

### Paso 3 · Front

1. **Pantalla:** `apps/web/src/modules/<slug>/index.tsx`, con export default del componente. Envolvé todo en `Marco` (encabezado y pie con la marca) y usá los componentes de `src/components/ui` y `src/components/watermelon`. Para sumar uno de Watermelon: `npx shadcn@latest add @watermelon/<nombre>` desde `apps/web`. Los colores son las clases de la marca (`bg-verde-600`, `text-rosa-600`, `bg-crema-200`…, definidas en `packages/marca`); no uses colores sueltos.
2. **Botón en la home:** sumá la ficha en `apps/web/src/modules/registry.ts`:

   ```ts
   {
     slug: 'guia-transito-forestal',
     nombre: 'Guía de tránsito forestal',
     descripcion: 'Pagá la guía para transportar madera.',
     categoria: 'Forestal',
     icono: 'truck',
   },
   ```

   El `icono` tiene que estar en el mapa de `apps/web/src/components/Icono.tsx` (si no está, se muestra uno genérico; agregalo ahí importándolo de `lucide-react`). Ojo: la home lee este archivo, **no** la tabla `pagos.modulos`, así que desactivar el módulo en la base no saca el botón.
3. **Ruta:** en `apps/web/src/main.tsx`:

   ```tsx
   import GuiaTransito from './modules/guia-transito-forestal';
   // ...
   <Route path="/pagar/guia-transito-forestal" element={<GuiaTransito />} />
   ```

4. **Llamar a la API:** con `fetch('/api/<slug>/...')`. En desarrollo, Vite manda `/api` a la API (puerto 3001).
5. **Datos de prueba**, si la API todavía no puede responder: en un archivo aparte dentro de la carpeta del módulo (como `fitosanitarios/demo.ts`), marcado como demostración. Nunca se usan para cobrar.

### Paso 4 · Tipos compartidos (si hace falta)

Si el front y el back intercambian una forma de datos propia del módulo (la respuesta de `/cotizar`, por ejemplo), declarala en `packages/shared/src/` y exportala desde `index.ts`. Así un cambio en el back rompe la compilación del front en vez de fallar en producción. Los tipos del contrato general (`ConfigModulo`, `Requisito`, `CalculoMonto`…) no se tocan desde un módulo: eso va en una rama `core/`.

### Paso 5 · Panel de Recaudaciones: no hay que hacer nada

`apps/admin` no tiene código por módulo. Con la migración aplicada, el trámite aparece solo:

| Pantalla | De dónde lo saca |
|---|---|
| Resumen y Pagos y órdenes | `pagos.ordenes_pago` con `modulo_slug = '<slug>'` |
| Trámites y tarifas | `pagos.modulos.config`: los campos que pide, el tipo de requisito y los conceptos de tarifa que necesita (`conceptosDeMonto`) con su valor vigente |
| Conciliación y Reportes | Todavía sin definir; van a salir de las mismas tablas |

Si un concepto no tiene tarifa cargada, el panel lo muestra como **"Sin valor: el trámite no puede cobrar"**. Así se nota que falta cargar el valor.

### Paso 5b · Panel del área (solo si los técnicos revisan)

Si el trámite necesita que alguien del área apruebe antes del pago (requisito `{ "tipo": "revision" }`), lleva su panel en `apps/paneles`:

1. En la `config` del módulo, decí quién entra con los permisos de Ecodatos: `"panel": { "formularios": ["<slug del formulario en Ecodatos>"], "areas": ["<key del área>"] }`. Entra quien tenga alguno asignado, o sea admin de Ecodatos. Con `es_editor = false` ve pero no actúa.
2. En la API, los endpoints del panel van en `apps/api/src/modules/<slug>/panel.ts`, protegidos con `requierePanel('<slug>')` (lectura) y `requierePanel('<slug>', { edicion: true })` (acciones) de `core/auth-ecodatos.ts`.
3. En la API, registrá el contador del badge: `registrarPendientes('<slug>', async () => /* cantidad sin tomar */)`.
4. En el front, la carpeta `apps/paneles/src/modules/<slug>/` (con sus subrutas) y su entrada en `apps/paneles/src/modules/registry.ts` (componente, ícono y descripción de la tarjeta). El inicio, el login y el menú lo resuelven solos.

Fitosanitarios es el ejemplo completo: `solicitudes.ts`, `publico.ts` y `panel.ts` en la API.

### Paso 6 · Probar

```bash
npm run dev:api      # API en :3001 (necesita DATABASE_URL)
npm run dev:web      # botonera
npm run dev:admin    # panel (necesita ADMIN_SIN_LOGIN=true)
npm run build        # typecheck y build de web, admin y api: tiene que pasar sin errores
```

Revisá:

- [ ] El botón aparece en la home, en su categoría, y el buscador lo encuentra.
- [ ] `/pagar/<slug>` funciona en celular y en escritorio.
- [ ] Los datos inválidos muestran un mensaje claro, y lo que no está configurado devuelve `503`, no un error 500.
- [ ] `curl localhost:3001/api/admin/tramites` muestra el trámite con sus campos y conceptos.
- [ ] En el panel, "Trámites y tarifas" muestra el trámite con sus conceptos.

### Paso 7 · Cerrar

1. Actualizá este README: el módulo en [Estado actual](#-estado-actual) y la migración nueva en la lista.
2. Traé lo último de `develop`, resolvé conflictos y abrí el PR de `modulo/<slug>` a `develop`. En la descripción, poné qué migración hay que correr y qué permisos sobre `public` pide.
3. Después del merge, el dueño del proyecto corre `npm run migrate`.

### Errores comunes

| Síntoma | Causa probable |
|---|---|
| La API no ve filas de una tabla nueva, o falla al insertar con `new row violates row-level security policy` | Falta la política `botonera_api` de la tabla (paso 1, punto 4) |
| `permission denied for table …` en `public` | Falta el `grant` en la migración, o se está escribiendo una columna que no se habilitó |
| La migración falla con `violates foreign key constraint … categorias` | La categoría no existe: insertala antes que el módulo |
| El panel dice "Sin valor" aunque hay tarifa | El `concepto` de la tarifa no se escribe igual que en `config.monto`, o su `vigente_desde` es futura |
| El trámite no aparece en el panel | El `slug` no coincide, o `config` no tiene `campos` / `requisito` / `monto` |
| Cambié una migración y no pasó nada | Las migraciones aplicadas no vuelven a correr: hacé una nueva |
| El botón tiene un ícono genérico | El `icono` no está en `Icono.tsx` |

## 🧭 Cómo funciona

**No hay logueo.** Nadie crea cuenta ni inicia sesión para pagar. El usuario busca su trámite, completa lo que ese trámite pide y, si cumple los requisitos, paga. El único login del sistema es el del panel `/admin`.

### Recorrido del usuario

1. **Busca su trámite.** En la home, con el buscador o navegando por categorías (Forestal, Fauna, Trámites y tasas, etc.), y entra al botón correspondiente (`/pagar/:slug`).
2. **Ve qué necesita.** La pantalla del trámite muestra qué datos pide y, si hay requisitos previos (estar inscripto en un registro, tener un acta, etc.), lo aclara antes de empezar.
3. **Completa los datos requeridos.** Cada trámite define sus propios campos (CUIT/CUIL, nº de acta, expediente, datos del titular, etc.).
4. **El back valida.** Se controla el formato de los datos y, **solo cuando el trámite lo exige**, se verifica que existan (y estén en condición) en la base.
5. **Si cumple, se habilita el pago.** Se muestra el resumen con el monto calculado por el back y se pasa al proveedor de pago.
6. **Pago y comprobante.** Al confirmarse el pago (webhook del proveedor) se emite el comprobante con un código de verificación.
7. **Si no cumple, no se paga.** Se le explica el motivo (no figura, está dado de baja, no tiene deuda, etc.) y qué hacer para resolverlo.

### Qué define cada trámite

Cada trámite (módulo) declara tres cosas:

| Definición | Qué es | Ejemplo |
|---|---|---|
| **Datos requeridos** | Los campos que hay que completar para poder lanzar el pago. | CUIT, nº de acta |
| **Requisito en la base** | Si hace falta que esos datos existan en la base (y en qué tabla/registro), o si alcanza con completarlos. | El CUIT tiene que estar en el Registro de Transportistas |
| **Cálculo del monto** | Monto fijo, fórmula sobre los datos, o monto que sale de la deuda encontrada. | Tasa fija; multa según el acta |

Con eso, cada trámite cae en uno de estos casos:

| Caso | Se pide | ¿Consulta a la base? | Se habilita el pago si… |
|---|---|---|---|
| **Libre** | Datos del formulario | No | Los datos están completos y con formato válido. |
| **Con registro** | CUIT/CUIL (y lo que defina el módulo) | Sí: busca en el registro | El CUIT figura en el registro y está activo. |
| **Con deuda** | Acta, CUIT u otro identificador | Sí: busca la deuda | Existe una deuda pendiente. El monto es el de la deuda. |

### Reglas que no cambian

- **La decisión la toma el back.** El front solo muestra y recolecta; nunca decide si se puede pagar ni manda un monto.
- **Todo trámite lleva CAPTCHA**, también los libres. El back lo verifica antes de validar nada.
- **Los datos se consultan solo si el trámite lo necesita.** Un trámite libre no toca la base.
- **Antes de pagar se muestra lo mínimo.** Sin sesión, saber un CUIT no prueba identidad: la consulta devuelve solo lo necesario para que la persona confirme (razón social, estado), nunca datos sensibles.
- **Se revalida al pagar.** Al crear la orden de pago y al recibir el webhook, el back vuelve a comprobar los requisitos y recalcula el monto.
- **Cualquiera puede pagar por un tercero.** Se controla que el dato exista y esté habilitado, no quién paga.
- **Sin requisito cumplido no hay `orden_pago`.** La orden solo se crea cuando el trámite pasó todas sus validaciones, y guarda los datos validados.

### 📜 Contrato de un trámite

Los tipos viven en `packages/shared/src/contrato.ts`. La config de cada trámite se guarda en `modulos.config` (jsonb):

```ts
interface ConfigModulo {
  campos: Campo[];        // datos requeridos
  requisito: Requisito;   // qué tiene que existir en la base
  monto: CalculoMonto;    // cómo se calcula el monto
}
```

| Tipo | Variantes |
|---|---|
| `Requisito` | `ninguno` (libre) · `registro` (registro, campo de búsqueda, estados que habilitan) · `deuda` (fuente, campos que la identifican) |
| `CalculoMonto` | `fijo` · `formula` (base + valor de campo × factor) · `escala` (importe según el tramo del campo) · `deuda` (el monto de la deuda encontrada). Ninguno lleva números: cada `concepto` apunta a una `Tarifa`. |
| `Tarifa` | Valor (importe o tramos) de un concepto, con `vigente_desde`. Se edita desde el panel; rige la última vigente a la fecha del cálculo y las anteriores se conservan. |

**Validación.** `POST /api/modulos/:slug/validar` recibe `{ datos, captcha }`. **El CAPTCHA es obligatorio en todos los trámites**, también los libres; el back lo verifica antes de cualquier otra cosa:

- Si cumple: `{ ok: true, monto, tarifas, datosMinimos?, validacionId }`. El monto lo calcula el back; `tarifas` son las versiones usadas, que se guardan en la orden.
- Si no: `{ ok: false, motivo, mensaje, errores? }`. Motivos: `datos_invalidos`, `no_registrado`, `no_habilitado`, `sin_deuda`, `captcha_invalido`, `limite_consultas`.

**Resolver.** Los trámites con `registro` o `deuda` implementan `Resolver.consultar(datos)` en `apps/api/src/modules/<slug>/resolver.ts`. Devuelve si encontró algo y los `DatosMinimos` (titular, estado, concepto), nunca domicilio ni teléfono. Para `deuda`, además el monto.

> El contrato se está definiendo con el módulo de fitosanitarios. La consulta API ya tiene endpoint propio; el flujo público de interfaz sigue usando datos de demostración.

El detalle de los niveles de validación y sus resguardos (anti-abuso, datos mínimos) está en [Acceso sin login](#-acceso-sin-login).

## 🔓 Acceso sin login

El público entra directo a `/pagar/:slug`, sin cuenta ni sesión. Según el trámite, el módulo define **qué hay que verificar antes de dejar pagar**:

| Nivel | Qué pasa | Ejemplo |
|---|---|---|
| Libre | Se completan los datos y se paga. | Tasa de trámite de monto fijo |
| Con registro | Se pide el CUIT/CUIL y se busca en un registro. Si está registrado, puede pagar; si no, se le indica cómo registrarse. | Emisión de certificado: el transportista tiene que figurar en el Registro de Transportistas |
| Con deuda | Se busca por acta, CUIT u otro dato y se muestra lo que debe. | Multa por apeo ilegal |

**Flujo con registro** (ej. certificado de transportista):

1. El usuario ingresa su CUIT.
2. El back valida el formato (dígito verificador) y busca el CUIT en el registro del módulo.
3. Si aparece, se muestran los datos que devuelve el registro (razón social, estado) para que confirme que es él, y avanza a los datos del trámite y al pago.
4. Si no aparece o está dado de baja/suspendido, no se habilita el pago y se explica qué hacer.

Consideraciones:

- **Qué tabla es el registro.** Cada módulo declara de dónde sale su registro: una tabla propia del módulo (`transportistas`, importada o mantenida por el área) o una consulta a otro sistema (por ejemplo Ecodatos). Es un `resolver` más del back.
- **Sin sesión, sin datos sensibles.** Saber un CUIT no prueba que uno sea esa persona. Por eso, antes del pago, la consulta devuelve solo lo mínimo (razón social, estado), nunca domicilio, teléfono, deudas ni documentos. El comprobante y los certificados emitidos se entregan con un código de verificación, no por una lista pública.
- **Anti-abuso.** CAPTCHA en todos los trámites (verificado en el back) y límite de consultas por IP/CUIT, para que no se use para recorrer el registro.
- **El pago no se confía al front.** El back guarda en la `orden_pago` el CUIT validado y recalcula todo al crear el pago y al recibir el webhook.
- **Cualquiera puede pagar por un tercero.** Es válido y deseable (un contador pagando por un cliente); lo que se controla es que el CUIT esté en el registro, no quién paga.

> ❓ A definir con el área: ¿el registro ya existe digital y de dónde se puede leer? ¿Hay trámites que además exijan estar al día con pagos anteriores?

## 🛠️ Panel de administración (`/admin`)

Es para la gente de Recaudaciones. Tiene login (único del sistema), roles y permisos por módulo. Tiene dos partes.

### 1. Configuración de cada trámite

Cada trámite tiene su pantalla de configuración, para que Recaudaciones cambie los valores sin tocar código ni pedir una migración:

- **Montos y tarifas:** importe fijo, valores de la fórmula (base, factores por unidad), escalas, recargos, intereses y descuentos.
- **Vigencias:** cada cambio de monto tiene fecha de inicio. Los valores anteriores se conservan (tarifas versionadas), no se pisan.
- **Habilitar o deshabilitar** el trámite y editar su texto y ayudas.
- **Qué NO se edita desde el panel:** el tipo de requisito (`ninguno` / `registro` / `deuda`) y los resolvers. Eso es código y cambia con una migración.

Reglas:

- Los números salen de la base, nunca están escritos en el código: `CalculoMonto` guarda una referencia a la tarifa vigente.
- La `orden_pago` **guarda el monto y la versión de tarifa con que se creó**. Un cambio de tarifa no altera órdenes ya generadas.
- Todo cambio queda en `auditoria` (quién, cuándo, valor anterior y nuevo).
- Permisos por módulo: cada persona edita solo los trámites de su área.

### 2. Panel general de Recaudaciones

- **Conciliación:** cruzar los pagos registrados con lo que informa MacroClick y con lo que se acredita en el banco. Marca pagos conciliados, pendientes y con diferencias (pagados sin orden, órdenes sin pago, montos distintos) y permite resolverlos con nota. Se apoya en la conciliación diaria automática.
- **Listado de pagos y órdenes:** filtros por trámite, categoría, fecha, estado, monto y CUIT; búsqueda por comprobante; detalle de cada pago con su historial.
- **Estadísticas y gráficos:** recaudación por período, por trámite y por categoría; cantidad de pagos; ticket promedio; comparación contra períodos anteriores; trámites más usados; pagos rechazados o abandonados.
- **Reportes:** exportables a Excel/CSV y PDF, con los mismos filtros (por ejemplo, el reporte diario para Tesorería). El formato lo define Contaduría.
- **Reimpresión de comprobantes** y consulta de auditoría.

### Roles

| Rol | Puede |
|---|---|
| Administrador | Todo, incluida la gestión de usuarios. |
| Recaudaciones | Ver todo, conciliar, emitir reportes y editar tarifas. |
| Responsable de área | Ver y editar los trámites de su área. |
| Auditor / consulta | Solo lectura y reportes. |

> ❓ A definir con Recaudaciones: formato de los reportes, cómo concilian hoy, si hace falta aprobación de un segundo usuario para cambiar un monto, y qué indicadores quieren ver primero.

## 📝 Solicitudes con revisión técnica

Para trámites donde el área controla requisitos antes de cobrar (hoy, fitosanitarios). **La persona no crea cuenta:**

1. Elige el tipo (vehículo, comercio, depósito…), pone su mail y confirma un código de 6 dígitos (vale 15 min, 5 intentos; máximo 5 códigos por mail y 20 por IP por hora).
2. Se crea la solicitud con un **enlace privado** (`/pagar/fitosanitarios/solicitud/<token>`) que le llega por mail. En la base se guarda el hash del token para buscarlo y el token cifrado (`SOLICITUDES_SECRETO`) para reenviar el enlace en los avisos. Si lo pierde, lo pide de nuevo con su mail.
3. Carga datos y documentos (PDF, JPG o PNG, hasta 10 MB; el tipo se comprueba por contenido). No puede enviar hasta cumplir todos los requisitos.
4. Los técnicos la ven en su panel: la **toman**, la **aprueban**, la **observan** (por requisito o en general) o la **rechazan** con un motivo. Cada acción le avisa por mail y queda en el historial y en la auditoría.
5. Si está observada, corrige lo marcado y la reenvía. Aprobada, tiene `aprobacionDias` (30) para pagar; si no, vence.

Estados: `borrador` → `enviada` → `en_revision` → `observada` / `aprobada` / `rechazada`; después `pagada` → `emitida`, o `vencida`. Los tipos, requisitos y plazos están en `modulos.config.solicitud` (ver `packages/shared/src/solicitudes.ts`); las reglas de validación son las mismas en el front y en el back.

**Mail:** `apps/api/src/core/correo.ts` manda por Gmail (`GMAIL_USER`/`GMAIL_APP_PASSWORD`) o Microsoft Graph (`MS_*`, `MAIL_FROM`), igual que mapa-pronostico. Con `MAIL_PROVIDER=consola` los mails solo se muestran en el log de la API (desarrollo).

## 🧑‍🔬 Paneles de área (`apps/paneles`)

Otro front, separado del de Recaudaciones: cada módulo que lo necesita tiene su panel, y entran los técnicos del área **con su usuario de Ecodatos**.

- Login con Supabase Auth de Ecodatos (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). La contraseña se recupera desde Ecodatos.
- `GET /api/paneles/yo` devuelve la persona y los paneles a los que entra, según `config.panel` de cada módulo y sus permisos en Ecodatos.
- **Inicio:** una tarjeta por panel, con un badge de solicitudes nuevas (sin tomar) que también aparece en el menú. Sale de `GET /api/paneles/pendientes`; cada módulo registra su contador con `registrarPendientes(slug, fn)` (`apps/api/src/routes/paneles.ts`). Se actualiza cada minuto, al volver a la pestaña y después de cada acción.
- **Trazabilidad:** queda registrado quién tomó la solicitud y cuándo (`revisor_*`, `tomada_en`) y quién la aprobó o rechazó (`resuelta_por_*`, `resuelta_en`), aunque sean personas distintas. Cada paso del historial guarda nombre, mail, IP, fecha y hora; cada observación, su autor; y cada acción va además a `pagos.auditoria`. Si alguien aprueba, observa o rechaza sin tomarla antes, la toma en ese momento.
- Fitosanitarios: listado por estado (Pendientes, En revisión, Observadas, Aprobadas, Rechazadas), búsqueda por número, titular, CUIT o mail; detalle con los datos, los documentos, observaciones, historial y las acciones.
- **Documentos:** se ven en un visor dentro del panel (PDF embebido, imágenes con zoom, flechas para pasar de uno a otro, descarga), sin abrir pestañas. Se bajan con enlaces firmados de 10 minutos; si vencen, el visor los renueva solo.
- **Confirmaciones:** tomar, aprobar, observar, rechazar y salir se confirman con SweetAlert2 (`src/lib/alertas.ts`, con los estilos de la marca), y cada acción muestra el resultado.
- Hoy entran las 6 personas con el formulario `fitosanitarios_domisanitarios` en Ecodatos. Para abrirlo a toda el área de Control Ambiental, sumar `"areas": ["control_ambiental"]` en `config.panel`.

## 💰 Proveedor de pago: MacroClick

- Aislado en `apps/api/src/core/payments/macroclick.ts`.
- Hay un proveedor `mock` que simula el pago; se elige con `PAYMENT_PROVIDER` en `.env`.
- `macroclick.ts` es un esqueleto que falla a propósito hasta tener el manual técnico y las credenciales del comercio (creación de la operación, firma/hash, URLs de retorno y notificación).

## 🚦 Estado actual

El catálogo genérico de ejemplo se retiró para empezar el primer módulo con código aislado.

- `/`: botonera de entrada con buscador y tarjetas para los módulos registrados en `apps/web/src/modules/registry.ts`.
- `/pagar/fitosanitarios`: módulo propio de Registro de fitosanitarios y domisanitarios. Cada trámite conserva su flujo dentro de su carpeta y aporta una ficha a la botonera.
- La pantalla muestra los tipos de certificado con sus requisitos e importe, pide el mail con código de verificación y lleva a la solicitud (ver [Solicitudes con revisión técnica](#-solicitudes-con-revisión-técnica)). Los técnicos la revisan en `apps/paneles`.
- API propia: `/api/fitosanitarios/tipos`, `/codigo`, `/solicitudes/...` (persona, con su enlace privado) y `/api/fitosanitarios/panel/...` (técnicos, con sesión de Ecodatos).
- Migraciones: `0001_pagos_base.sql` (núcleo), `0002_fitosanitarios.sql` (renovaciones; el registro se lee de `public.fitosanitarios_domisanitarios`), `0003_rol_botonera.sql` (rol de la API), `0004_config_fitosanitarios.sql` (config según `ConfigModulo`), `0005_solicitudes_fitosanitarios.sql` (solicitudes, documentos, observaciones, historial, códigos de verificación, bucket `fitosanitarios` y tipos y requisitos provisorios), `0006_permisos_ecodatos.sql` (lectura de los permisos de Ecodatos), `0007_revision_trazabilidad.sql` (quién tomó y quién resolvió cada solicitud; mail e IP en el historial). Falta que el área agregue DNI/CUIT y vencimiento en el registro.
- El pago todavía no está integrado a MacroClick ni emite certificados: la solicitud aprobada muestra el botón de pago deshabilitado.

### 📊 Panel de Recaudaciones (`apps/admin`)

- App aparte: Vite + React 19 + Tailwind v4 + shadcn (Radix) con componentes de [Watermelon UI](https://ui.watermelon.sh). Se suman con `npx shadcn@latest add @watermelon/<nombre>` desde `apps/admin`.
- Base visual: el bloque `capitalio-dashboard`, que queda sin tocar en `src/components/watermelon/`; el panel propio vive en `src/panel/` y reutiliza su CSS, tarjetas, tooltips e íconos.
- Pantallas: Resumen (indicadores, recaudación por día/mes, por trámite, últimos pagos), Pagos y órdenes (filtros, búsqueda, paginado, CSV), Trámites y tarifas, Auditoría. Conciliación y Reportes quedan como pendientes de definir.
- API: `GET /api/admin/resumen?periodo=hoy|7d|30d|anio`, `/ordenes`, `/tramites`, `/auditoria` (tipos en `packages/shared/src/admin.ts`).
- **Login preparado, sin conectar:** `/login` (adaptado de Watermelon `auth-11`) deja entrar sin completar nada. Todo pasa por `src/panel/sesion.tsx` (`LOGIN_CONECTADO`, `iniciarSesion`, `RequiereSesion`); conectar el login es cambiar ese archivo y el middleware de `apps/api/src/routes/admin.ts`. Tipos de usuario y roles en `packages/shared/src/admin.ts`.
- `/api/admin` responde solo con `ADMIN_SIN_LOGIN=true`, y eso es solo para desarrollo local.

### 🎨 Decisiones de diseño tomadas

- Licencia de pesca fuera: se maneja en un sistema aparte.
- Solo modo claro.
- El primer módulo usa una pantalla propia, adaptable a celular y escritorio, con flujo de búsqueda, renovación y certificado imprimible.
- Estilos del Brandbook 2024 del ministerio (Oak Sans, verde `#3E6C51`, crema, rosa lapacho, logo oficial) en todas las apps. Viven en `packages/marca`: un cambio ahí se aplica en la botonera, el panel y el relevamiento.

### ▶️ Cómo correrlo

```bash
npm install
cp .env.example .env     # completar DATABASE_URL (solo si se usa la API)
npm run dev:web          # front
npm run dev:api          # API (requiere DATABASE_URL)
npm run dev:admin        # panel de Recaudaciones → http://localhost:5174 (requiere ADMIN_SIN_LOGIN=true en .env)
npm run dev:paneles      # paneles de área → http://localhost:5176 (login de Ecodatos)
```

Para las solicitudes, el `.env` necesita además `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SOLICITUDES_SECRETO` y el mail (o `MAIL_PROVIDER=consola`). Está todo explicado en `.env.example`.

## ✅ Pendiente del módulo fitosanitarios

- Relevar campos y estados oficiales del registro, cómo se determina la habilitación y el formato del certificado.
- Confirmar los tipos de certificado, sus requisitos, tasas y plazos (las preguntas están en el relevamiento, sección 7). Los de `0005` son provisorios.
- Avisar a los técnicos cuando entra una solicitud nueva (hoy la ven al entrar al panel).
- Importar y depurar el Excel de titulares y certificados en las tablas propias mediante un proceso controlado.
- Configurar la tarifa oficial desde administración y conectar el importe calculado por API con una orden de pago.
- Confirmar pago con el proveedor y emitir/guardar el certificado definitivo de un año.
- Acordar CAPTCHA y límite de consultas antes de exponer la búsqueda pública.
- Manual técnico y credenciales de MacroClick; panel `/admin` y funcionalidades generales de Recaudaciones.

## 📋 Herramienta de relevamiento (local)

App aparte, solo para el trabajo de campo: `apps/relevamiento` (Express + SQLite local + React, un solo puerto).

- Correr: `npm run dev:relevamiento` → http://localhost:5180
- Datos: `apps/relevamiento/data/relevamiento.db` (ignorado por git; hacer copia a mano).
- Procesos con ficha (tipo, área, ¿va por la web?, estado, prioridad, responsable, norma, disparador…) y listas editables y ordenables de pasos, conceptos a pagar, documentos/certificados y datos del formulario.
- Pestaña «Guía de relevamiento»: checklist de qué preguntar, con notas. Editable en `apps/relevamiento/src/guia.ts`.
- Exportar a Markdown o JSON desde la pestaña «Exportar».

## ▶️ Mostrar todo el flujo

Una terminal por comando, todas desde la raíz del repo:

| Comando | Qué levanta | Dirección |
|---|---|---|
| `npm run dev:api` | API (y la base local si no hay red del ministerio) | http://localhost:3001 |
| `npm run dev:web` | Botonera pública: la persona pide el trámite y paga | http://localhost:5173 |
| `npm run dev:paneles` | Panel de área: el técnico revisa la solicitud | http://localhost:5176 |
| `npm run dev:admin` | Panel de Recaudaciones: pagos y trámites | http://localhost:5174 |

Orden del flujo: **web** (solicitud) → **paneles** (revisión) → **web** (pago, con el proveedor `mock`) → **admin** (se ve el pago). Levantar primero `dev:api`.

Para correr los cuatro juntos en una sola terminal: `npm run dev`.
