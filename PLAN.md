# Botonera de pagos — Plan

Botonera para que el público pague desde la página del Ministerio de Ecología todo lo que el ministerio cobra. Incluye backend, panel de administración y front.

## Arquitectura

**Un solo front, con módulos como plugins.** El 90% del circuito es igual (identificar al contribuyente, ver el monto, pagar, recibir comprobante). Cambian los datos que se piden y cómo se calcula el monto.

| Tipo de módulo | Cómo se define | Ejemplo |
|---|---|---|
| Simple | Solo configuración en la base: campos, monto fijo o fórmula. Sin código. | Tasa de trámite con monto fijo |
| Con consulta | Configuración más un "resolver" en el back que busca la deuda (por acta, CUIT, etc.). | Multa por apeo ilegal |
| Complejo | Componente React propio y rutas propias en el back. | Fitosanitarios, con certificados y flujo propio |

Un módulo nuevo no toca el resto del sistema.

### Estructura

```
botonera-pagos/
├─ apps/
│  ├─ web/        Vite + React + TypeScript: botonera pública + /pagar/:slug + /admin
│  └─ api/        Node + Express + TypeScript
├─ packages/
│  └─ shared/     tipos y esquemas compartidos front/back
└─ db/migrations/ SQL del schema "recaudaciones"
```

- Monorepo con npm workspaces.
- El panel admin va dentro de `web` bajo `/admin`, con lazy loading.
- Backend: `core/` (pagos, comprobantes, auth, proveedor de pago) y una carpeta `modules/<slug>/` por proceso, con su definición, resolver de deuda, validaciones y hooks.
- Front: la home lee `GET /api/modulos` y dibuja los botones. `/pagar/:slug` renderiza un formulario generado desde la config (módulo simple) o carga su componente con `React.lazy` (módulo complejo).

### Schema `recaudaciones` (núcleo)

- `modulos`: slug, nombre, ícono, categoría, orden, activo, tipo, configuración (jsonb)
- `categorias`: agrupan los botones
- `ordenes_pago`: la deuda o intención de pago (módulo, contribuyente CUIL/CUIT, monto, estado, referencia al objeto del módulo)
- `pagos`: intentos y confirmaciones del proveedor, con payload crudo
- `comprobantes`
- `auditoria`
- `usuarios_admin` y `roles`, con permisos por módulo

Cada módulo suma sus propias tablas con prefijo (`apeo_actas`, `fito_certificados`, …). Una `orden_pago` apunta al registro del módulo con `modulo_slug` + `ref_id`.

### Decisiones fijadas

1. El front nunca habla con la base. Todo pasa por la API, que se conecta por `pg` directo, sin exponer el schema en PostgREST. RLS activado igual, por prevención.
2. Proveedor de pago como interfaz (`crearPago`, `webhook`, `consultarEstado`). Ningún módulo conoce al proveedor.
3. Auth como adaptador. Hoy identificación simple (CUIL + datos); después adaptador OIDC para Mi Argentina. Los módulos solo ven `req.contribuyente`.
4. Montos y estados se calculan y validan solo en el back. El front nunca manda un monto.
5. Webhooks idempotentes y conciliación diaria (es plata pública).
6. Las migraciones quedan como archivos SQL; las corre el dueño del proyecto. No se toca el Supabase desde acá.

## Proveedor de pago: MacroClick

- Aislado en `apps/api/src/core/payments/macroclick.ts`.
- Hay un proveedor `mock` que simula el pago; se elige con `PAYMENT_PROVIDER` en `.env`.
- `macroclick.ts` es un esqueleto que falla a propósito hasta tener el manual técnico y las credenciales del comercio (creación de la operación, firma/hash, URLs de retorno y notificación).

## Estado actual

Es un mock del front, sin base ni API.

- Home con 11 botones de ejemplo en 5 categorías (Forestal, Fitosanitarios, Fauna, Control ambiental, Trámites y tasas), con íconos y buscador.
- Catálogo en `apps/web/src/mock/catalogo.ts` (único archivo a editar para cambiar botones). `VITE_USE_MOCK=false` vuelve a la API real.
- `/pagar/:slug`: flujo simulado completo (datos, resumen con total, pago de "MacroClick", comprobante imprimible). Los campos y el monto salen de la config del módulo.
- Los módulos marcados como complejo (guías forestales, fitosanitarios, evaluación ambiental) usan hoy el flujo genérico.
- API Express con `GET /api/health` y `GET /api/modulos`.
- Migraciones: `0001` crea el schema con `categorias` y `modulos`; `0002` carga datos de ejemplo.

### Decisiones de diseño tomadas

- Licencia de pesca fuera: se maneja en un sistema aparte.
- Categoría "Fauna y pesca" renombrada a "Fauna".
- Solo modo claro.
- Categorías en 3 columnas (2 en tablet hasta 900 px, 1 en celular hasta 560 px), con los botones apilados debajo de cada una.
- Botones de hasta 320 px, centrados.
- Encabezado compacto.
- Estilo neutro (paleta gris azulada); las variables están en `apps/web/src/styles.css`, así que un manual de marca se aplica en un solo lugar.

### Cómo correrlo

Desde la raíz: `npm run dev:web` (front) y `npm run dev:api` (API, no hace falta para el mock).

## Pendiente

- Manual técnico y credenciales de MacroClick.
- Lista real de trámites y pagos del ministerio (se carga como filas de `modulos` y `categorias`, o en el mock).
- `ordenes_pago` y `pagos`, con el circuito completo usando el proveedor mock, empezando por un módulo (multas por apeo ilegal) para definir el contrato que seguirán los demás.
- Panel `/admin`.
- Integración con Mi Argentina.

## Herramienta de relevamiento (local)

App aparte, solo para el trabajo de campo: `apps/relevamiento` (Express + SQLite local + React, un solo puerto).

- Correr: `npm run dev:relevamiento` → http://localhost:5180
- Datos: `apps/relevamiento/data/relevamiento.db` (ignorado por git; hacer copia a mano).
- Procesos con ficha (tipo, área, ¿va por la web?, estado, prioridad, responsable, norma, disparador…) y listas editables y ordenables de pasos, conceptos a pagar, documentos/certificados y datos del formulario.
- Pestaña «Guía de relevamiento»: checklist de qué preguntar, con notas. Editable en `apps/relevamiento/src/guia.ts`.
- Exportar a Markdown o JSON desde la pestaña «Exportar».
