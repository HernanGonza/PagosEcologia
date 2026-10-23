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
| Front (`apps/web`) | React 18, Vite, React Router 6, lucide-react (íconos) |
| Back (`apps/api`) | Node.js, Express 5, `pg` (conexión directa a Postgres), `cors` |
| Código compartido (`packages/shared`) | Tipos TypeScript compartidos entre front y back |
| Base de datos | PostgreSQL, en el Supabase self-hosted de Ecodatos |
| Migraciones | Archivos SQL en `db/migrations/` |
| Pagos | MacroClick, detrás de una interfaz de proveedor (hoy hay un `mock`) |
| Relevamiento (`apps/relevamiento`) | Express + SQLite local + React (herramienta aparte, solo local) |
| Desarrollo | `tsx` (API con recarga automática), Vite (front) |

## 🔌 Conexión a Supabase (Ecodatos)

La base de la botonera va a vivir en el **Supabase self-hosted de Ecodatos**, el otro sistema del ministerio. Usamos un schema propio (`recaudaciones`) dentro de esa instancia, separado de los datos de Ecodatos.

- La API se conecta directo a Postgres con `pg`, usando la variable `DATABASE_URL` del `.env`.
- El front nunca habla con Supabase: todo pasa por la API. El schema no se expone en PostgREST y tiene RLS activado por prevención.
- Las credenciales no están en el repo. Cada quien arma su `.env` a partir de `.env.example` y las pide al dueño del proyecto.
- Las migraciones de `db/migrations/` las corre el dueño del proyecto sobre esa instancia; desde este repo no se modifica la base.

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
│  ├─ web/        Vite + React + TypeScript: botonera pública + /pagar/:slug + /admin
│  └─ api/        Node + Express + TypeScript
│     └─ src/modules/<slug>/   un módulo por carpeta (definición, resolver, validaciones)
├─ packages/
│  └─ shared/     tipos y esquemas compartidos front/back
└─ db/migrations/ SQL del schema "recaudaciones"
```

- Monorepo con npm workspaces. **Todos los módulos viven en este mismo repo**, no hay un repo por módulo: el back en `apps/api/src/modules/<slug>/` y, si es complejo, su componente en `apps/web/src/modules/<slug>/`.
- El panel admin va dentro de `web` bajo `/admin`, con lazy loading.
- Backend: `core/` (pagos, comprobantes, auth, proveedor de pago) y una carpeta `modules/<slug>/` por proceso, con su definición, resolver de deuda, validaciones y hooks.
- Front: la home lee `GET /api/modulos` y dibuja los botones. `/pagar/:slug` renderiza un formulario generado desde la config (módulo simple) o carga su componente con `React.lazy` (módulo complejo).

### 🧩 Cómo se hacen los módulos

**Un módulo no es una app Vite+React aparte.** Hay un solo front (`apps/web`) y una sola API (`apps/api`); un módulo es una carpeta o una fila de configuración que se enchufa en ellos. Todo vive en este repo, sin repo ni build por módulo.

| Tipo | Qué hay que crear | Código |
|---|---|---|
| Simple | Una fila en `recaudaciones.modulos` con su `config` (campos, monto fijo o fórmula). | Ninguno |
| Con consulta | Lo anterior, más `apps/api/src/modules/<slug>/` con el resolver que busca la deuda. | Solo back |
| Complejo | Lo anterior, más `apps/web/src/modules/<slug>/` con su componente React, cargado con `React.lazy`. | Back y front |

Pasos para sumar un módulo:

1. **Base:** una migración nueva en `db/migrations/` que inserte la fila en `modulos` (y la categoría si es nueva) y cree las tablas propias con prefijo (`apeo_actas`, `fito_certificados`, …).
2. **Back (si consulta o complejo):** carpeta `apps/api/src/modules/<slug>/` con la definición, el resolver de deuda, las validaciones y los hooks. El monto y el estado se calculan siempre acá, nunca en el front.
3. **Front (solo si complejo):** carpeta `apps/web/src/modules/<slug>/` con el componente. Si el módulo no la tiene, `/pagar/:slug` usa el formulario genérico generado desde la config.
4. **Tipos compartidos:** lo que usen el front y el back va en `packages/shared`.

```
apps/api/src/modules/apeo-ilegal/        apps/web/src/modules/fitosanitarios/
├─ index.ts      definición + registro   └─ index.tsx   componente del flujo propio
├─ resolver.ts   busca la deuda (acta/CUIT)
└─ validar.ts    reglas del módulo
```

El módulo no conoce al proveedor de pago: usa el `core/` (órdenes de pago, comprobantes). La validación del contribuyente la define el propio módulo (ver [Acceso sin login](#-acceso-sin-login)).

> ⚠️ **Estado:** hoy `modules/` está vacío y el front usa el flujo genérico para todos. El contrato exacto (qué exporta `index.ts` y cómo se registra) se define con el primer módulo, multas por apeo ilegal, y se documenta acá. Los nombres de archivo del ejemplo son una propuesta.

### 🌿 Flujo de ramas

Trabajamos **una rama por módulo**, salidas de `develop`:

- Nombre: `modulo/<slug>` (por ejemplo `modulo/multas-apeo-ilegal`).
- Cada módulo se desarrolla en su rama (migración, back y front si corresponde) y se mergea a `develop` cuando está terminado.
- Cambios al núcleo (`core/`, `packages/shared`, este README) van en ramas aparte (`core/<tema>`), para que no se mezclen con un módulo.
- Antes de empezar una rama y antes de mergear a `develop`, traer lo último de `develop`.
- `develop` es la rama de trabajo: ahí se junta todo lo que se va terminando.
- `main` es la rama de **despliegue**. Cuando `develop` está estable, se pasa a `main` y de ahí sale lo que se publica. No se trabaja directo en `main`.

### 🗄️ Schema `recaudaciones` (núcleo)

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

> ⚠️ Es la primera versión: se ajusta con el primer módulo real (multas por apeo ilegal). Todavía no está conectado al mock ni a la API.

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

## 💰 Proveedor de pago: MacroClick

- Aislado en `apps/api/src/core/payments/macroclick.ts`.
- Hay un proveedor `mock` que simula el pago; se elige con `PAYMENT_PROVIDER` en `.env`.
- `macroclick.ts` es un esqueleto que falla a propósito hasta tener el manual técnico y las credenciales del comercio (creación de la operación, firma/hash, URLs de retorno y notificación).

## 🚦 Estado actual

Es un mock del front, sin base ni API.

- Home con 11 botones de ejemplo en 5 categorías (Forestal, Fitosanitarios, Fauna, Control ambiental, Trámites y tasas), con íconos y buscador.
- Catálogo en `apps/web/src/mock/catalogo.ts` (único archivo a editar para cambiar botones). `VITE_USE_MOCK=false` vuelve a la API real.
- `/pagar/:slug`: flujo simulado completo (datos, resumen con total, pago de "MacroClick", comprobante imprimible). Los campos y el monto salen de la config del módulo.
- Los módulos marcados como complejo (guías forestales, fitosanitarios, evaluación ambiental) usan hoy el flujo genérico.
- API Express con `GET /api/health` y `GET /api/modulos`.
- Migraciones: `0001` crea el schema con `categorias` y `modulos`; `0002` carga datos de ejemplo.

### 🎨 Decisiones de diseño tomadas

- Licencia de pesca fuera: se maneja en un sistema aparte.
- Categoría "Fauna y pesca" renombrada a "Fauna".
- Solo modo claro.
- Categorías en 3 columnas (2 en tablet hasta 900 px, 1 en celular hasta 560 px), con los botones apilados debajo de cada una.
- Botones de hasta 320 px, centrados.
- Encabezado compacto.
- Estilo neutro (paleta gris azulada); las variables están en `apps/web/src/styles.css`, así que un manual de marca se aplica en un solo lugar.

### ▶️ Cómo correrlo

```bash
npm install
cp .env.example .env     # completar DATABASE_URL (solo si se usa la API)
npm run dev:web          # front
npm run dev:api          # API (no hace falta para el mock)
```

## ✅ Pendiente

- Manual técnico y credenciales de MacroClick.
- Lista real de trámites y pagos del ministerio (se carga como filas de `modulos` y `categorias`, o en el mock).
- `ordenes_pago` y `pagos`, con el circuito completo usando el proveedor mock, empezando por un módulo (multas por apeo ilegal) para definir el contrato que seguirán los demás.
- Panel `/admin`: configuración de trámites (tarifas versionadas) y panel de Recaudaciones (conciliación, estadísticas, filtros, reportes). Ver la sección «Panel de administración».
- Definir con cada área qué registro valida cada trámite (empezando por el Registro de Transportistas) y de dónde se lee.
- Contrato del resolver de registro: búsqueda por CUIT, validación de formato, datos mínimos que devuelve, límite de consultas y CAPTCHA.

## 📋 Herramienta de relevamiento (local)

App aparte, solo para el trabajo de campo: `apps/relevamiento` (Express + SQLite local + React, un solo puerto).

- Correr: `npm run dev:relevamiento` → http://localhost:5180
- Datos: `apps/relevamiento/data/relevamiento.db` (ignorado por git; hacer copia a mano).
- Procesos con ficha (tipo, área, ¿va por la web?, estado, prioridad, responsable, norma, disparador…) y listas editables y ordenables de pasos, conceptos a pagar, documentos/certificados y datos del formulario.
- Pestaña «Guía de relevamiento»: checklist de qué preguntar, con notas. Editable en `apps/relevamiento/src/guia.ts`.
- Exportar a Markdown o JSON desde la pestaña «Exportar».
