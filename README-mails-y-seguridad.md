# Mails, enlaces, sesiones y seguridad de las solicitudes

Cómo funciona el acceso **sin cuenta** al trámite de fitosanitarios y domisanitarios: la verificación
del mail, los enlaces de un solo uso, la sesión, cuándo se manda cada mail, cuánto dura cada cosa y
qué protege cada medida. Está escrito para que alguien que no vio el código pueda revisar el diseño
y encontrar agujeros, así que además de lo que se hace explica **por qué** y **qué queda sin resolver**.

> ## ⚠️ El pago NO está implementado
> Este documento describe el acceso, los mails y la seguridad de las **solicitudes**. El **pago de la
> tasa y la emisión del certificado todavía no existen**: en la pantalla el botón "Pagar la tasa" está
> deshabilitado ("el pago en línea se habilita con la integración de MacroClick"), no hay pasarela,
> ni webhook, ni mail de "certificado emitido". El estado `pagada` y `emitida` existen en el modelo pero
> nada los alcanza todavía. Todo lo que se dice del pago o de `emitida` es **diseño previsto, no
> comportamiento actual**, y las consecuencias de seguridad del pago (sección 9) están pendientes.

> **Dónde está el código**
> - `apps/api/src/core/verificacion.ts`: códigos de verificación (HMAC, topes, reenvío).
> - `apps/api/src/core/correo.ts`: envío de mails (proveedores) y chequeo de arranque.
> - `apps/api/src/modules/fitosanitarios/solicitudes.ts`: enlaces, sesiones, vigencias, `SQL_ADMITE_ENLACE`.
> - `apps/api/src/modules/fitosanitarios/publico.ts`: flujos de la persona (cookie, origen, iniciar, continuar, recuperar, canjear, solicitud).
> - `apps/api/src/modules/fitosanitarios/panel.ts`: avisos de los técnicos (aprobar, observar, rechazar).
> - `apps/web/src/modules/fitosanitarios/`: pantallas (`index.tsx` inicio y recuperar, `Solicitud.tsx` solicitud y canje del enlace, `api.ts` cliente).
> - **Actualización:** además de la sesión por solicitud descripta acá, existe la **sesión de persona** (mail + código) para "Mis certificados" y la cabecera `X-Solicitud`; ver `README-titulares-y-certificados.md`, sección 11. Los pedidos de código tienen el propósito nuevo `fitosanitarios:persona`.
> - Migración: `db/migrations/0009_enlaces_y_sesiones.sql` (tablas `pagos.fito_enlaces` y `pagos.fito_sesiones`).

---

## 1. La idea en una línea

La persona no tiene cuenta. Su **mail** es su identidad (la prueba con un **código** que llega a su
casilla). Con eso entra a su solicitud mediante una **sesión** (cookie). Para **volver** más tarde, o
desde otro dispositivo, usa un **enlace de un solo uso** que le llega por mail, o pide uno nuevo con
otro código.

Resumen del modelo de amenazas:

- El enlace del mail es una llave de **un solo uso**: al canjearlo se convierte en una sesión y deja de servir.
- La sesión vive en una cookie `HttpOnly` y se cierra por inactividad y por antigüedad.
- Un enlace reenviado, filtrado en un log o guardado en el historial **no sirve** una vez usado o vencido.

---

## 2. Glosario

| Término | Qué es |
|---|---|
| **Código** | 6 números que llegan por mail para probar que la casilla es de quien lo pide. |
| **Enlace** | `/pagar/fitosanitarios/solicitud#<token>`. El token (32 bytes al azar, 43 caracteres) va en el **fragmento** (`#`), que el navegador no manda al servidor ni en el `Referer`. De **un solo uso**. |
| **Canjear** | Cambiar el enlace por una sesión (`POST /sesion`). Solo se puede una vez. |
| **Sesión** | Una cookie `fito_sesion` (`__Host-fito_sesion` con https; HttpOnly, SameSite=Strict, Secure en https) atada a **una** solicitud. |
| **Enlace de inicio** | El del mail que llega al crear la solicitud. Sirve para volver más tarde: plazo largo (24 h) para canjearlo. |
| **Enlace de recuperar** | El del mail de *recuperar*. La persona lo está esperando: plazo corto (15 min). |
| **Enlace de aviso** | El que llega en los mails del panel (aprobada, observada). Plazo largo para canjearlo. |
| **Vencer un enlace** | Dejarlo sin efecto de inmediato. |
| **Solicitud que admite enlace** | La que no está `rechazada` ni `vencida` ni es una aprobación con el plazo de pago pasado (ver 6). |

---

## 3. Las piezas

| Pieza | Para qué sirve | Cómo es | Duración |
|---|---|---|---|
| **Código** | Probar acceso al mail | 6 números al azar | 15 min, 5 intentos, un solo uso |
| **Enlace** | Entrar a una solicitud desde un mail | 32 bytes al azar, de un solo uso | Plazo para canjearlo: 24 h (inicio), 15 min (recuperar) o 30 días (aviso) |
| **Sesión** | Operar sobre la solicitud (ver, editar, subir, enviar) | Cookie HttpOnly con un valor al azar | 30 min de inactividad, máximo 4 h |

Reglas que se cumplen siempre:

1. **Cada mail lleva un enlace nuevo.** Nunca se reenvía uno anterior (no es posible: no se guardan).
2. **Un enlace nuevo vence a los anteriores sin usar** de esa solicitud, solo los emitidos *antes* que él (por número de emisión, `seq`). Cuando el enlace se manda por mail, eso ocurre **solo si el mail salió**.
3. **Un enlace se canjea una sola vez.** Después de canjearlo no sirve, ni siquiera durante su plazo.
4. **Cada sesión nueva cierra las sesiones anteriores de esa solicitud.** Abrir la solicitud en otro dispositivo cierra la sesión del primero.
5. **Todo vence.** No hay enlaces ni sesiones permanentes.
6. En la base se guardan **solo hashes** (SHA-256) del enlace y de la cookie. Nadie con acceso a la base puede leer ni reenviar un enlace ni usar una sesión.
7. El código se guarda como **HMAC-SHA256** con un secreto del servidor (`VERIFICACION_SECRETO`).

---

## 4. Flujos

### 4.1 Iniciar una solicitud

1. La persona elige el tipo de certificado y escribe su mail.
2. `POST /codigo` → se le manda un **código** (propósito `fitosanitarios:solicitud`, vale 15 min).
   Si ya se pidió un código para ese mail y propósito **hace menos de 1 minuto**, no se genera otro
   (el anterior sigue vigente) y no se manda otro mail; la respuesta es igual.
3. Escribe el código → `POST /solicitudes`.
   - **Si el mail no tiene solicitudes en curso** (o pide crear otra con `nueva: true`): se consume el
     código, se crea la solicitud en `borrador` y **se abre una sesión directamente** (la API responde
     con la cookie: la persona entra sin pasos extra). Además se manda el mail **"Solicitud FITO-…: tu
     enlace para continuar"** con un enlace de inicio (24 h para canjearlo), para volver más tarde.
   - **Si ya tiene solicitudes en curso:** se le listan (número, tipo, estado y fecha, **sin enlaces ni
     sesión**) y el código sigue vigente. Puede continuar una (4.3) o crear otra (`nueva: true`).
   - **Límite de borradores:** una casilla no puede tener más de **3 solicitudes en `borrador`** al mismo tiempo. Se cuenta por **casilla canónica** (sin `+etiqueta`, y sin puntos en Gmail): `juan+1@`, `juan+2@` y `juan@` son la misma casilla.

### 4.2 Entrar con el enlace de un mail (canje)

1. La persona toca el botón del mail y llega a `/pagar/fitosanitarios/solicitud#<token>`.
2. El front lee el token del fragmento y **lo borra de la URL y del historial enseguida**.
3. Muestra una pantalla con el botón **"Abrir mi solicitud"**. El canje es un **clic explícito**, no
   ocurre al cargar la página: un escáner de mails (Safe Links, antivirus) que solo visite el enlace
   no lo gasta. (Además, el fragmento no se envía al servidor, así que un escáner que baje solo el HTML
   ni siquiera ve el token.)
4. Al tocar, `POST /sesion` con el token en el **cuerpo**: la API lo marca como usado, cierra las
   sesiones anteriores de esa solicitud y responde con la cookie.
5. Desde ahí el front usa solo la cookie (`GET /solicitud`, etc.). El token ya no aparece en ninguna URL.

Si el enlace no vale, `POST /sesion` responde **404 con `codigo: 'enlace_invalido'`** y el front redirige
a pedir uno nuevo. Se distingue:
- **Ya usado:** la respuesta trae `motivo: 'usado'` y `usadoEn`, y la pantalla dice *"Este enlace ya se usó el 31/10 14:05…"*. El texto está pensado para no alarmar a quien lo usó él mismo (con el aviso de 30 días es normal volver a tocar el mismo botón días después): *"Si fuiste vos, pedí un enlace nuevo con tu mail. Si no fuiste vos, pedí igual uno nuevo (cierra la sesión anterior) y avisanos."* Si no fue la persona, es la señal de que alguien entró con un mail reenviado.
- **Vencido, inválido o reemplazado:** mensaje genérico.

### 4.3 Continuar una solicitud en curso (tras verificar el mail)

`POST /continuar` con `email`, `codigo` y `numero`:
- **Consume el código.**
- **Verifica que la solicitud sea de ese mail**: busca por `email` (el que acaba de probar) **y** `numero`, y
  que la solicitud admita enlace (6). Los números `FITO-AAAA-NNNNNN` son secuenciales y adivinables, pero
  con un número ajeno no se obtiene nada (404).
- **Abre una sesión** para esa solicitud (cierra las anteriores). No se manda mail ni se emite enlace.

> Por qué: antes, el listado de "en curso" devolvía enlaces de **todas** las solicitudes sin consumir
> el código (un "recuperar" encubierto, repetible 15 minutos). Ahora el listado no da acceso a nada y
> cada acceso sale de una acción que consume un código.

### 4.4 Recuperar los enlaces (perdidos, usados o vencidos)

1. En la página del trámite, la persona pone su mail → `POST /codigo` con `para: 'recuperar'`.
   El código es **de otro propósito** (`fitosanitarios:recuperar`): el de iniciar no sirve acá ni al revés.
2. Escribe el código → `POST /recuperar`. Incorrecto: 400. Correcto: **se consume** y la API responde
   `{ ok: true }` **de inmediato**, haya o no solicitudes con ese mail.
3. **En segundo plano** la API:
   1. busca las solicitudes de ese mail que admitan enlace (incluye `emitida`, para volver a bajar el certificado; ver el aviso sobre el pago);
   2. emite un enlace de recuperar nuevo por cada una;
   3. **justo antes de enviar**, descarta los que ya no estén vigentes (por ejemplo, porque otro enlace más nuevo los venció): no se manda un enlace muerto;
   4. manda **un** mail **"Tus solicitudes de fitosanitarios"** con los que quedan;
   5. **solo si el mail salió**, vence los enlaces anteriores sin usar de cada solicitud. Si falló, descarta los nuevos y la persona conserva los que tenía.

Responde sin esperar al envío para que el **tiempo de respuesta** no delate qué mails tienen solicitudes.
Pide código porque, sin él, cualquiera que conociera un mail podría vencer los enlaces de esa persona
pidiendo otros. No hay un tope aparte para recuperar: cada recuperación consume un código, y los
pedidos de código ya están limitados (sección 8).

### 4.5 Operar con la sesión

Con la cookie: ver la solicitud (`GET /solicitud`), guardar datos (`PUT /solicitud/datos`), subir un
documento (`PUT /solicitud/documentos/:requisito`), bajarlo (`GET /solicitud/documentos/:id`) y
enviarla (`POST /solicitud/enviar`). Cada uso renueva el plazo de inactividad (30 min) hasta el máximo de 4 h.

Cuando no hay sesión válida (venció, la cerró otra sesión nueva, no hay cookie): la API responde
**401 con `codigo: 'enlace_invalido'`** y el front **redirige a `/pagar/fitosanitarios?enlace=vencido`**,
donde se muestra un aviso y el bloque *¿Ya iniciaste una solicitud?* para pedir un enlace nuevo.

### 4.6 Enviar la solicitud

La persona completa los requisitos y la envía (`borrador` u `observada` → `enviada`). Le llega
**"Solicitud …: la recibimos"** (o *"recibimos las correcciones"*). Este mail no trae enlace.

### 4.7 Avisos de los técnicos (panel)

| Acción del técnico | Mail | ¿Enlace? | Estado nuevo |
|---|---|---|---|
| Aprobar | "Solicitud …: aprobada" (con el plazo para pagar) | Sí: *Continuar con el pago* | `aprobada` |
| Observar (pedir correcciones) | "Solicitud …" con la lista de observaciones | Sí: *Corregir la solicitud* | `observada` |
| Rechazar | "Solicitud …: rechazada" con el motivo | No | `rechazada` |

Los enlaces de estos avisos son de **aviso**: se pueden canjear durante **30 días** (porque no se sabe
cuándo los va a leer la persona) y, como todos, **una sola vez**. Se emiten con `avisarConEnlace`:
emite el enlace, comprueba que siga vigente, **manda el mail y solo si salió** vence los anteriores;
si el envío falla, descarta el nuevo y la persona conserva el que tenía.

El aviso **no cierra la sesión abierta** de la persona (si está editando, sigue editando). Cuando
canjee el enlace del aviso, esa sesión nueva cierra la anterior.

> "Continuar con el pago" **hoy no lleva a ningún pago**: el pago no está implementado (ver el aviso al inicio).

### 4.8 Qué pasa con enlaces y sesiones al cambiar de estado

- Al pasar a **`rechazada`** o **`vencida`**, los enlaces sin usar de la solicitud se vencen. La sesión
  abierta, si la hay, sigue hasta su vencimiento normal (puede ver el motivo del rechazo).
- En **`emitida`** se puede **recuperar** un enlace con el mail y un código (solo previsto: la emisión no existe todavía).
- **No hay mail de "certificado emitido" ni de "la aprobación venció"**: la emisión no existe y el vencimiento
  se detecta al abrir la solicitud (no hay proceso que lo revise solo), por lo que avisar por mail no agregaría nada hoy (sección 10).

---

## 5. Duraciones (todo en un lugar)

| Qué | Duración | Variable (`.env` de la API) |
|---|---|---|
| Código de verificación | 15 min, 5 intentos | fijo |
| Reenvío de código | no se genera otro si se pidió hace < 1 min | fijo |
| Plazo para canjear el enlace del mail de **inicio** | 24 h | `ENLACE_INICIO_MINUTOS` (en minutos: `1440`) |
| Plazo para canjear el enlace de **recuperar** | 15 min | `ENLACE_RECUPERAR_MINUTOS` |
| Plazo para canjear un enlace de aviso (panel) | 30 días | `ENLACE_AVISO_MINUTOS` (en minutos: `43200`) |
| Sesión: inactividad | 30 min | `SESION_INACTIVIDAD_MINUTOS` |
| Sesión: máximo desde que se abre | 4 h | `SESION_MAXIMO_MINUTOS` (en minutos: `240`) |
| Enlaces vencidos hace más de 1 día | se borran al emitir nuevos | fijo |
| Sesiones inactivas hace más de 1 día | se borran al abrir sesiones nuevas | fijo |

Otras variables: `TRUST_PROXY` (cuántos proxies hay delante de la API; ver 9.16) y `VERIFICACION_SECRETO` (las dos obligatorias en producción), `WEB_URL` (base de los enlaces y
origen permitido), `ORIGENES_PERMITIDOS` (orígenes extra, separados por coma).

---

## 6. Qué solicitudes admiten un enlace (una sola definición)

`SQL_ADMITE_ENLACE` en `solicitudes.ts` es la única definición, usada por **recuperar** y **continuar**:

```
estado no está en ('rechazada','vencida')
y no (estado = 'aprobada' y aprobacion_vence < hoy en Argentina)
```

**"Hoy" es la fecha de Argentina** (`(now() at time zone 'America/Argentina/Buenos_Aires')::date`, constante `SQL_HOY`), no la de UTC: `aprobacion_vence` es un `date` y vence a la medianoche de allá. Al aprobar, el plazo también se calcula con esa fecha.

El segundo renglón existe porque `vencida` se guarda recién cuando alguien abre la solicitud (no hay
un proceso que lo revise solo). **Todo lo que dependa de un plazo se calcula contra la fecha del
servidor y nunca contra el estado guardado**; así una aprobación con el plazo de pago pasado no recibe
enlaces aunque su estado guardado siga siendo `aprobada`.

El **panel de técnicos** usa la misma regla: su listado, sus filtros y sus conteos usan el estado *efectivo* (`sqlEstadoEfectivo`: una aprobación con el plazo pasado figura como `vencida` aunque el estado guardado no se haya actualizado), igual que el detalle.

`SQL_EN_CURSO` = lo anterior y además `estado <> 'emitida'`. Es lo que se **lista** al iniciar otra
solicitud (no tiene sentido ofrecer "continuar" una ya emitida).

---

## 7. Los mails

| # | Mail | Cuándo | Lleva |
|---|---|---|---|
| 1 | Tu código de verificación | Al iniciar | Código (15 min) |
| 2 | Tu código de verificación | Al recuperar | Código (15 min) |
| 3 | Tu enlace para continuar | Al crear la solicitud | Enlace de inicio (una vez, 24 h) |
| 4 | Tus solicitudes de fitosanitarios | Al recuperar con código correcto | Un enlace de recuperar por solicitud (una vez, 15 min) |
| 5 | La recibimos / recibimos las correcciones | Al enviar | Sin enlace |
| 6 | Aprobada | Aprueba un técnico | Enlace de aviso (30 días, una vez) |
| 7 | Correcciones pedidas | Un técnico observa | Enlace de aviso (30 días, una vez) |
| 8 | Rechazada | Rechaza un técnico | Sin enlace |

Los mails con enlace dicen que es de un solo uso y personal, e incluyen la frase *"Nunca te vamos a
pedir contraseñas ni datos de tarjeta por mail"*. Los datos cargados por la persona se **escapan**
(`escapar` en `correo.ts`) antes de ir al HTML del mail.

**Envío:** `avisar()` manda el mail y devuelve `true`/`false`. Si falla, lo registra en la consola de la
API y **no deshace** el cambio de estado. Lo único que depende del resultado es **vencer los enlaces
anteriores** (solo si salió). "Salió" significa que el servidor de correo **aceptó** el mensaje, no que
llegó: si después rebota, los anteriores ya estarán vencidos y la persona tendrá que recuperar uno
nuevo (inherente a este diseño).

**Proveedor** (se elige por el `.env`):

| Proveedor | Variables |
|---|---|
| Consola (solo desarrollo; imprime el mail, **incluidos códigos y enlaces**) | `MAIL_PROVIDER=consola` (solo se activa si se pone explícitamente) |
| Gmail (SMTP, contraseña de aplicación) | `GMAIL_USER`, `GMAIL_APP_PASSWORD` |
| Microsoft 365 (Graph, permiso `Mail.Send`) | `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MAIL_FROM` |

Otras: `MAIL_FROM_NOMBRE` (nombre del remitente). **En producción la API no arranca** con
`MAIL_PROVIDER=consola`, ni sin `VERIFICACION_SECRETO`, ni sin `TRUST_PROXY` (`NODE_ENV=production`).

---

## 8. Qué protege cada medida

| Riesgo | Medida |
|---|---|
| Adivinar un enlace o una cookie | 32 bytes al azar (256 bits), formato validado antes de consultar la base. |
| Leer enlaces o sesiones desde la base | Solo hashes; no se puede reconstruir ni reenviar un enlace ni usar una sesión. |
| Enlace reenviado, guardado en el historial o filtrado en un log | **Un solo uso**: tras canjearlo no sirve. El token va en el fragmento `#` (no llega a logs de acceso ni al `Referer`) y se borra de la URL y del historial al cargar la página. Mientras no se canjea, vence a las 24 h (inicio), 15 min (recuperar) o 30 días (aviso). |
| Un escáner de mails "abre" el enlace y lo gasta | El canje es un clic explícito (`POST /sesion`); el fragmento ni siquiera llega al servidor en una visita. |
| Robo de la sesión por JavaScript (XSS) | Cookie `HttpOnly`: el JavaScript no puede leerla. |
| Un subdominio comprometido pisa la cookie | Con https la cookie se llama `__Host-fito_sesion`: el navegador exige `Secure`, `Path=/` y sin `Domain`, así que un subdominio no puede pisarla. En desarrollo (http) va sin prefijo. |
| Alguien entró con un enlace reenviado y la persona no se entera | Al intentar usar un enlace ya usado se muestra cuándo se usó (4.2). |
| CSRF (otro sitio que dispara pedidos con la cookie) | `SameSite=Strict` y, en pedidos que modifican datos, el `Origin` debe ser `WEB_URL` o uno de `ORIGENES_PERMITIDOS`. |
| Sesión abandonada en un equipo ajeno | 30 min de inactividad y máximo 4 h. |
| Sesión robada por una copia del enlace | Cada sesión nueva cierra las anteriores de esa solicitud. |
| Filtración del token por `Referer` | `Referrer-Policy: no-referrer` en la API y `<meta name="referrer" content="no-referrer">` en el front. |
| Respuestas personales en cachés | `Cache-Control: no-store` y `X-Content-Type-Options: nosniff` en toda la API pública. |
| Averiguar qué mails tienen solicitudes | *Recuperar* responde siempre igual y **sin esperar al envío**; exige código. |
| Vencer los enlaces de otra persona pidiendo enlaces con su mail | *Recuperar* y *continuar* exigen un código que llega a su casilla y lo consumen. |
| Pedir acceso a la solicitud ajena sabiendo su número | `continuar` busca por mail verificado **y** número. |
| Usar el código de iniciar para recuperar | Propósitos separados; el listado de "en curso" no da acceso. |
| Quedarse sin enlace si el mail falla | Los anteriores se vencen solo si el mail nuevo salió. |
| Dos enlaces emitidos casi a la vez | Un enlace nuevo solo vence a los emitidos antes (por `seq`), nunca a uno más nuevo; y no se manda un mail con un enlace ya vencido. |
| Enlaces que ya no sirven (rechazada, vencida) | Se vencen al cambiar de estado. |
| Aprobación con plazo vencido que sigue "aprobada" | `SQL_ADMITE_ENLACE` y el panel calculan contra la fecha de Argentina del servidor (sección 6). |
| Adivinar el código (1 en 1.000.000) | 5 intentos, 15 min, solo vale el último pedido **por mail y por propósito**, se consume al usarlo, comparación en tiempo constante. |
| Código legible desde la base | HMAC con secreto del servidor (un hash simple de 6 dígitos se revierte al instante). |
| Anular el código que la persona está escribiendo | No se genera otro si se pidió hace menos de 1 minuto. Ese pedido ignorado **no inserta una fila**, así que **no cuenta** para el tope de 5/hora (la persona que toca *reenviar* varias veces no gasta su cupo). |
| Mandar mails a terceros o llenar una casilla (incluidas las variantes `+etiqueta` y los puntos de Gmail) | Tope de pedidos de código: **5/hora por casilla canónica** y **20/hora por IP**, contados en la base, compartidos entre propósitos. Como cada recuperación consume un código, también acota a *recuperar*. |
| Llenar el almacenamiento | Máximo 3 borradores por **casilla canónica**; 10 MB por archivo; 100 MB por solicitud (cuenta los documentos reemplazados); **300 MB por casilla** (todas sus solicitudes y variantes). Hasta que exista la limpieza programada nada borra los archivos. |
| Archivos maliciosos | Tipo comprobado por **contenido** (no por extensión): solo PDF, JPG y PNG. Un SVG/HTML no puede subirse. |
| Acceso a las tablas desde fuera | RLS activo y política solo para el rol `botonera` (incluidas `fito_enlaces` y `fito_sesiones`); ver 9 sobre verificarlo. |
| Arrancar en producción con la configuración de desarrollo | La API no arranca con `MAIL_PROVIDER=consola`, ni sin `VERIFICACION_SECRETO`, ni sin `TRUST_PROXY`. |

El panel de técnicos usa otra autenticación (Supabase de Ecodatos, `Authorization: Bearer`); no usa
estas cookies. Los documentos del bucket privado se ven por enlaces firmados de 10 minutos.

"Casilla canónica" = sin `+etiqueta` y, en Gmail, sin puntos. Se usa para **contar** pedidos de código, borradores y almacenamiento (`email_canonico`); la
identidad de la solicitud y el destino de los mails siguen siendo el mail exacto (que ya se normaliza a minúsculas y sin espacios).

---

## 9. Límites conocidos y puntos a verificar

Se listan a propósito: son lo que **no** está resuelto o conviene revisar.

1. **El pago no está implementado.** Cuando se haga:
   - la confirmación del pago debe depender del aviso (webhook o retorno firmado) de la pasarela, **nunca** de que la sesión o el enlace de la persona sigan vigentes;
   - el retorno desde la pasarela puede llegar con la sesión vencida (30 min / 4 h) y debe manejarse;
   - **`SameSite=Strict` y el retorno desde la pasarela:** con `Strict` el navegador **no manda la cookie** cuando la persona vuelve desde otro sitio (MacroClick) con una navegación de nivel superior, así que el primer pedido llegaría sin sesión aunque esté vigente. La página de retorno **no debe depender de la cookie en ese primer request**: que el front cargue y después pida el estado con `fetch` (que sí lleva la cookie), o que el estado se muestre a partir del retorno firmado. Alternativa: pasar a `SameSite=Lax` (los pedidos que modifican datos no son GET y ya exigen `Origin` propio);
   - todo control de plazo de pago debe calcularse contra la fecha de Argentina del servidor (6).
2. **Emisión del certificado.** Tampoco existe. Cuando exista debe mandar un mail con un enlace nuevo
   ("certificado emitido"); hoy solo se podría volver a una solicitud `emitida` recuperando con el mail.
3. **Mails del panel que fallan.** Quedan solo en la consola de la API: sin cola con reintentos, sin
   registro en la base ni aviso al técnico. Lo único que se garantiza es que la persona no pierde su
   enlace anterior; pero puede no enterarse de una observación o aprobación.
4. **Molestia con una casilla ajena.** Quien conozca un mail puede pedir códigos y llenar esa casilla
   (hasta 5/hora por casilla canónica y 20/hora por IP) y, pasados 60 s, anular el código que la persona
   esté por escribir. No da acceso a nada. Si agota el tope de la hora, la persona queda bloqueada hasta
   que pase. Se acepta por ahora.
5. **Si el mail falla, el código ya se gastó.** En *recuperar* la API responde `ok` antes de enviar; si el
   envío falla, la persona no recibe nada y debe pedir otro código.
6. **El mail es la identidad.** Quien controle la casilla puede recuperar el acceso.
7. **Una sesión sirve a quien la tenga** hasta que venza o la reemplace otra (cookie `HttpOnly`, pero un
   equipo compartido o un robo de la cookie sigue siendo un riesgo, acotado por 30 min / 4 h).
8. **Pasar de un dispositivo a otro** exige recuperar un enlace (la sesión no se comparte). Es deliberado.
9. **Un navegador completo** que simule un clic en *Abrir mi solicitud* (un escáner muy sofisticado) gastaría
   el enlace; la persona tendría que recuperar otro.
10. **El enlace del mail de inicio dura 24 h** para canjearse (la persona ya entró por la sesión que se abre al iniciar; es solo para volver). Pasado ese tiempo hay que recuperar uno. Canjearlo cierra las sesiones anteriores de esa solicitud (otros dispositivos).
11. **RLS:** si el rol `botonera` es **dueño** de las tablas, RLS no lo restringe salvo `FORCE ROW LEVEL
    SECURITY`. Lo que realmente protege es que `anon` y `authenticated` no tengan permisos sobre el esquema
    `pagos` y que `pagos` no esté expuesto en PostgREST. **A verificar en la base.**
12. **`vencida` no avisa por mail** y el estado guardado se actualiza recién al abrir la solicitud. Recuperar, continuar y el listado del panel ya usan el estado *efectivo* (6), pero la fila en la base sigue diciendo `aprobada` hasta que alguien la abra o exista el proceso programado.
13. **`cors()` abierto** en la API (sin credenciales): las cookies solo viajan en pedidos del mismo sitio
    (`SameSite=Strict`, proxy `/api`), pero conviene restringir `cors()` al origen de la web.
14. **El `Origin` se exige solo si el navegador lo manda.** Un cliente que no es un navegador y no manda `Origin`
    pasa el control, pero ese cliente no tiene la cookie de nadie.
15. **Sin auditoría completa.** `fito_sesiones` guarda IP y navegador de cada sesión y `fito_historial` los cambios
    de estado con su actor, pero no se registran emisión, canje ni vencimiento de enlaces, ni recuperar/continuar.
16. **IP detrás del proxy (`trust proxy`).** El tope de 20/hora por IP y las IP guardadas en `fito_sesiones` dependen de
    que Express obtenga la IP real. Si no confía en el proxy, todos los pedidos llegan con la IP del proxy y el tope pasa a ser
    20/hora para todo el mundo; si confía de más, `X-Forwarded-For` se puede falsear y el tope no sirve.
    - **En producción la API no arranca sin `TRUST_PROXY`** (cantidad de proxies delante, ej. `1` si solo hay HAProxy). El valor por defecto
      (confiar en cualquier IP privada) queda solo para desarrollo: en una LAN como la del ministerio permitiría falsear `X-Forwarded-For`.
    - **El puerto de la API solo debe ser accesible desde el proxy** (firewall). Si se puede llegar directo, el proxy de confianza no sirve
      y cualquiera puede mandar su propio `X-Forwarded-For`. **A verificar en el servidor.**
17. **Reescritores de enlaces.** El token va en el fragmento `#`. La mayoría de los clientes de mail lo preserva, pero hay que
    **probar el enlace real** con Outlook/M365 (Safe Links), Gmail web, Gmail en el celular y un cliente de escritorio antes de
    producción. Si alguno lo pierde, la persona llega sin token y no entiende por qué (vería la solicitud vacía o la página de pedir enlace).
18. **Retención de datos personales.** `fito_sesiones` guarda IP y navegador. Hoy una fila se borra al abrir otra sesión para la misma
    solicitud o, como mucho, **1 día después de su último uso** (limpieza oportunista al abrir sesiones nuevas). Si más adelante se arma
    una auditoría de largo plazo (sección 10), hay que definir cuánto tiempo se conservan (por ejemplo 90 días o un año) y
    mencionarlo en el aviso de privacidad del trámite: son datos personales bajo la Ley 25.326.
19. **Documentos que ven los técnicos: riesgo aceptado, bajo condición.** El tipo se valida por contenido (solo PDF, JPG y PNG). Las URLs
    firmadas se arman con `SUPABASE_URL` (`enlaceFirmado`, `core/storage.ts`), o sea que se sirven desde el dominio de Supabase Storage,
    **otro origen** que el panel: un archivo que ejecute código ahí no puede leer la sesión del panel, y el visor de PDF de los navegadores
    corre aislado. Por eso no se fuerza `Content-Disposition: attachment` (se perdería la vista previa). **Condición a confirmar al
    desplegar:** que el storage no pase por un proxy bajo el mismo dominio que el panel. (Los documentos que la persona ve de su
    propia solicitud salen por `GET /solicitud/documentos/:id`, con el tipo comprobado por contenido, `nosniff` y desde la API.)
20. **Aviso de "dispositivo nuevo".** No se manda un mail por cada canje del enlace ("se abrió tu solicitud desde otro dispositivo"). La
    señal actual es solo el mensaje de "ya usado" (4.2). Un mail por canje sería más visible pero ruidoso (el propio canje de la persona lo dispararía).

---

## 10. Pendiente para más adelante (no implementado)

| Mejora | Qué resolvería |
|---|---|
| **Proceso programado (cron/worker)** | Marcar como `vencida` las aprobaciones sin pago (y vencer sus enlaces, y avisar por mail); reintentar mails fallidos desde una tabla `mails_pendientes` y mostrarlos en el panel; borrar borradores abandonados y sus archivos (ej. a los 30 días). |
| **Registro de auditoría** | Tabla de eventos con fecha, IP y user-agent: emisión/canje/vencimiento de enlaces, recuperar, continuar, cambios de estado con el técnico. Sirve para reclamos ("yo nunca abrí eso") y para detectar abuso. |
| **Seguridad del panel de técnicos** | Es el mayor riesgo residual: una cuenta de técnico comprometida puede aprobar, ver documentos y disparar mails. Falta documentar autenticación (MFA), vigencia de sesiones y qué queda auditado. Se autentican contra Ecodatos (Supabase) y el panel manda su token como `Authorization: Bearer`. **El cliente de Supabase lo guarda en `localStorage`** (`storageKey: 'paneles.sesion'` en `apps/paneles/src/sesion.tsx`), por lo que un XSS en el panel se lo llevaría: hay que revisarlo junto con el MFA (CSP estricta, sin scripts de terceros, sanitizar todo lo que se renderiza). |
| **Mails** | SPF, DKIM y DMARC en el dominio remitente; en producción M365 con el dominio oficial (no Gmail). |
| **Pago y emisión** | Ver 9.1 y 9.2. |

---

## 11. Estado de las observaciones de revisiones anteriores

| Observación | Estado |
|---|---|
| Listado "en curso" como recuperar encubierto | Resuelto: el listado no da acceso; `continuar` consume el código. |
| Tope de 24 h hacía morir los avisos | Resuelto: los avisos se pueden canjear durante 30 días. |
| Mail fallido dejaba sin enlace | Resuelto: se vence lo anterior solo si el mail salió. |
| Código legible desde la base | Resuelto: HMAC con secreto. |
| Escáneres de mails gastaban el tiempo | Resuelto: canje por clic + token en el fragmento. |
| Lectura de datos sin gastar el reloj (GET) | Resuelto de raíz: ya no hay datos accesibles por URL; se necesita sesión. |
| `emitida` sin forma de recuperar | Parcial: `recuperar` y `continuar` la incluyen; el mail de emisión depende de implementar la emisión. |
| Carrera al vencer enlaces | Resuelto: orden por `seq` y recheck antes de enviar. |
| `continuar` vs mail ajeno | Verificado y documentado (4.3). |
| "Último pedido" por mail o por propósito | Aclarado: por mail y por propósito. |
| Dos definiciones de "en curso" | Resuelto: `SQL_ADMITE_ENLACE` / `SQL_EN_CURSO`. |
| Plazo contra el estado guardado | Resuelto: se calcula contra la fecha del servidor (6). |
| Token en la URL / `Referer` / logs | Resuelto: fragmento `#`, `Referrer-Policy`, sesión por cookie. |
| Enlace reutilizable y sesión renovable | Resuelto: un solo uso + sesión con inactividad 30 min / máximo 4 h. |
| Normalizar mails | Parcial: los topes de códigos, los borradores y el almacenamiento cuentan por casilla canónica; la identidad sigue siendo el mail exacto. |
| Archivos subidos | Ya estaba: tipo por contenido, tope por archivo. Agregado: tope por solicitud y por casilla, y 3 borradores por casilla. |
| `MAIL_PROVIDER=consola` en producción | Resuelto: la API no arranca. |
| Reenviar/ignorar código si se pidió hace < 1 min | Resuelto. |
| Mail de inicio inútil (15 min) | Resuelto: plazo de 24 h para ese mail; el de recuperar queda en 15 min (`ENLACE_RECUPERAR_MINUTOS`). |
| Límite de borradores esquivable con `+etiqueta` | Resuelto: se cuenta por casilla canónica; además, 300 MB por casilla. |
| Zona horaria de `aprobacion_vence` | Resuelto: fecha de Argentina en la regla, en el panel y al aprobar. |
| `SameSite=Strict` y retorno de la pasarela | Documentado (9.1); se resuelve al implementar el pago. |
| Panel con el estado guardado | Resuelto: listado, filtros y conteos usan el estado efectivo. |
| `trust proxy` | `TRUST_PROXY` obligatorio en producción; firewall y prueba **a verificar en el servidor** (9.16). |
| Distinguir "ya usado" de "vencido" | Resuelto: se muestra cuándo se usó, con un texto que no alarma a quien lo usó ("si fuiste vos, pedí uno nuevo; si no, pedí igual uno nuevo y avisanos"). |
| Prefijo `__Host-` en la cookie | Resuelto (con https). |
| Retención de IP y navegador | Documentado (9.18); la definición de plazo depende de la auditoría. |
| `Content-Disposition: attachment` para el panel | Aceptado sin forzar, bajo condición (9.19). |
| Cron, auditoría, panel, DMARC | Pendientes (sección 10). |

---

## 12. Cómo probarlo

1. Con `MAIL_PROVIDER=consola`, los mails (con códigos y enlaces) salen en la consola de la API.
2. Para ver vencimientos sin esperar: `SESION_INACTIVIDAD_MINUTOS=1`, `ENLACE_RECUPERAR_MINUTOS=1`, `ENLACE_INICIO_MINUTOS=1` y reiniciar la API.
3. Recorrido sugerido:
   - **Iniciar:** completar mail y código → entra directo (cookie). Verificar en el navegador que la cookie (`fito_sesion`, o `__Host-fito_sesion` con https) es `HttpOnly` y `SameSite=Strict`.
   - **Un solo uso:** copiar el enlace del mail de inicio; tocar *Abrir mi solicitud* una vez (entra) y abrir **otra vez** el mismo enlace → debe redirigir a pedir uno nuevo.
   - **Fragmento:** al abrir el enlace, la URL debe quedar sin `#token` (y no estar en el historial).
   - **Escáner:** `curl` al enlace del mail no cambia nada; solo el clic en el botón lo canjea.
   - **Sesión:** esperar más que `SESION_INACTIVIDAD_MINUTOS` sin usar la página y actuar → redirige a pedir enlace.
   - **Sesiones cruzadas:** abrir la solicitud en dos navegadores con enlaces distintos → el primero queda sin sesión.
   - **Recuperar:** pedir código, recuperar → llega un enlace nuevo; el anterior sin usar debe fallar. Con un código incorrecto 5 veces, deja de aceptar ese código.
   - **Código reciente:** pedir dos veces seguidas el código para un mail → solo llega un mail.
   - **Continuar:** con un mail que ya tiene solicitudes, el listado no da acceso; al elegir una, `POST /continuar` consume el código y abre sesión. Con el número de otro mail → 404.
   - **Ya usado:** abrir dos veces el mismo enlace → la segunda muestra cuándo se usó.
   - **Origen:** `POST` a la API con `Origin` ajeno → 403.
   - **Variantes de mail:** crear borradores con `juan@gmail.com`, `juan+1@gmail.com`, `j.uan+2@gmail.com`, `juan+3@gmail.com` → el 4.º falla.
   - **Zona horaria:** con `aprobacion_vence` = hoy en Argentina, entre las 21:00 y las 24:00 (cuando en UTC ya es mañana) la solicitud todavía admite enlace.
   - **Reenviar código:** tocar *reenviar* 3 veces seguidas → un solo mail y el cupo de 5/hora intacto.
   - **Reescritores de mail:** abrir el enlace desde Outlook/M365, Gmail web y celular y un cliente de escritorio, y confirmar que el `#token` llega.
   - **Avisos:** aprobar y observar desde el panel → el mail trae un enlace de aviso; la sesión abierta de la persona sigue funcionando.
   - **Mail que falla:** sin proveedor de mail configurado, el enlace anterior sigue sirviendo.
   - **Estados:** rechazar una solicitud → sus enlaces sin usar dejan de valer.
   - **Aprobación vencida:** cambiar `aprobacion_vence` a una fecha pasada → recuperar/continuar ya no la incluyen, aunque el estado diga `aprobada`.
   - **Límites:** crear 4 borradores con el mismo mail → el 4.º falla; subir más de 100 MB en una solicitud → falla.

---

## 13. Despliegue

1. Correr las migraciones pendientes (`npm run migrate`): `0009_enlaces_y_sesiones.sql` (esta) y, a continuación, `0010` y `0011` (titulares y certificados; ver `README-titulares-y-certificados.md`, secciones 9 y 10) **antes** de usar el código nuevo. Crea
   `pagos.fito_enlaces` y `pagos.fito_sesiones` (con RLS), agrega `email_canonico` a
   `pagos.verificaciones_email`, y **borra** las columnas `token_hash` y `token_cifrado` de
   `pagos.fito_solicitudes`.
2. Los enlaces enviados antes de la migración **dejan de funcionar**; las personas piden uno nuevo con su
   mail. Las rutas viejas con el token en el path redirigen a pedir uno nuevo.
3. Definir `VERIFICACION_SECRETO` en el `.env` de producción (≥ 32 caracteres: `openssl rand -base64 48`).
   Los códigos pedidos antes del cambio dejan de valer (duran 15 min). Sin esa variable, sin `TRUST_PROXY`, o con
   `MAIL_PROVIDER=consola`, la API **no arranca** con `NODE_ENV=production`.
4. Con `WEB_URL` en `https://…` la cookie se llama `__Host-fito_sesion`, con `Path=/` y `Secure`. Detrás de un proxy, `/api` debe estar en el mismo origen que la web.
5. Definir `TRUST_PROXY` (obligatorio en producción; por ejemplo `1` si solo hay HAProxy delante de la API), comprobar que `req.ip` sea la IP real del cliente y que el puerto de la API solo sea accesible desde el proxy.
6. Antes de producción, verificar: RLS y permisos sobre `pagos` (9.11), `TRUST_PROXY` y firewall (9.16) y el `#token` con los clientes de mail reales (9.17).
7. Se eliminó `core/secretos.ts` y `SOLICITUDES_SECRETO`: quitar la variable del `.env` real.
