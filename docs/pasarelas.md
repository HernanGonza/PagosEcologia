# Pasarelas de pago (Click de Pago / Macro)

Estado (2026-11-16): **driver de formulario escrito, sin rutas todavía; esperando que el banco habilite las consultas.**
Fuentes: manual BM50377 (jun25) y colección Postman en `docs/pasarela/`, SDK de PlusPagos, el sistema de pesca (Laravel) y
pruebas hechas contra el sandbox.

## Qué anda y qué no en el sandbox (probado)
Cuentas probadas: FITOSANITARIO y FORESTAL (mismo comportamiento). Base: `https://sandboxpp.asjservicios.com.ar:8082/v1`
(`sandboxpp.macroclickpago.com.ar` da lo mismo). Producción: `https://botonpp.asjservicios.com.ar:8082/v1`.

| Servicio | Resultado |
|---|---|
| `GET /health`, `POST /sesion` | OK |
| `POST /link-pago` | OK **solo si se manda `back_url`** (el manual dice que es opcional; sin ella devuelve el error engañoso "No se encontró la sucursal para el comercio") |
| `GET /transaction/{id}`, `/transactions`, `/transaction/search`, `/payment-methods`, `/caja`, `GET/POST /order/{caja}` | **403 con cuerpo vacío** con token válido |
| Formulario POST al checkout | **Probado de punta a punta (2026-11-16):** el banco aceptó los campos cifrados y el hash, cobró $1,00 con la Visa de prueba y volvió a `CallbackSuccess` (ver "Formulario") |

El manual dice, ante el 403, "pedir acceso a servicios a Click de Pago" (documentado para cajas; aplicarlo a las consultas
es una inferencia). Pedido enviado al banco el 2026-11-14 por la mesa de ayuda del panel. Hipótesis sin confirmar: el comercio
está dado de alta como "Botón Simple" y no como "Botón integrado"; o hay lista blanca de IP en la API.
Todas las respuestas traen cookies `__uzm*` (capa anti-bots): no esquivarla.

**Sin la consulta, no hay forma de reconfirmar un pago.** Por eso las rutas y el link no se implementan hasta tenerla.

## Decisiones tomadas
- **Un solo driver, varias cuentas** en `apps/api/src/core/payments/macroclick.ts`, instanciado por cuenta con
  `cuentaDesdeEnv(nombre)`. Es transversal (va en lo general, no en un módulo). Cada módulo declara su `cuentaPago`.
- **Checkout por redirección completa** (el contribuyente va a la página del banco y vuelve por la URL de retorno).
- **El contribuyente no puede cambiar el monto.** Por eso el monto lo fija el servidor y viaja cifrado o dentro del link.
- **Modalidad: formulario** es la que está escrita. El link funciona pero el aviso del banco no trae monto, así que sin la
  consulta al banco no se puede verificar; queda como alternativa cuando se habilite.
- **El aviso del banco no se cree nunca** (ver Seguridad).

## `.env` (por cuenta)
```
PAGOS_<CUENTA>_AMBIENTE=sandbox|produccion
PAGOS_<CUENTA>_MODALIDAD=formulario           # el driver rechaza cualquier otra
PAGOS_<CUENTA>_URL_POST=https://sandboxpp.asjservicios.com.ar/
PAGOS_<CUENTA>_GUID=
PAGOS_<CUENTA>_FRASE=
PAGOS_<CUENTA>_SECRET_KEY=                    # la devuelve POST /sesion; clave del cifrado y del hash
PAGOS_<CUENTA>_SUCURSAL=0000000000
PAGOS_<CUENTA>_WEBHOOK_TOKEN=                 # va en la URL del aviso; generar uno distinto por cuenta
```
Nunca se loguean `guid`, `frase` ni `secretKey`. Cuentas hoy: FITOSANITARIO (sucursal 61645, "Casa Central", caja `DEFAULT`
en mayúsculas) y FORESTAL, cada una con credenciales propias. `PAYMENT_PROVIDER` sigue en `mock`.

## Formulario (modalidad escrita)
El navegador del contribuyente hace `POST` a la URL del banco con una página que se envía sola (`paginaAutoEnvio`).
Campos (algoritmo de la librería oficial PlusPagos):
- `CallbackSuccess`, `CallbackCancel`, `Monto` (en centavos), `Informacion`, `SucursalComercio`: cifrados con
  **AES-256-CBC**, clave = secretKey repetida/cortada a 32 caracteres, IV aleatorio, resultado `base64(iv + cifrado)`.
- `Comercio` (GUID) y `TransaccionComercioId`: en claro.
- `Hash` = SHA-256 hex de `ip*comercio*sucursal*monto*secretKey` con los valores **sin cifrar**. `ip` es la del contribuyente
  tal como la ve nuestro servidor, así que hace falta `TRUST_PROXY` bien puesto.
- `Producto[0]`, `MontoProducto[0]`.

**Verificado con un pago real de sandbox (2026-11-16, FITOSANITARIO, $1,00, `PRUEBA-FORM-...`):** el checkout mostró el detalle y el monto correctos (el banco descifró bien), el pago se aprobó ("¡Listo! Tu pago se procesó correctamente") y el navegador volvió a la URL de `CallbackSuccess` con un `GET` **sin ningún dato** en la URL: confirma que el retorno no sirve para confirmar nada. El hash usó la IP pública del navegador (la misma que vio el banco). Falta ver el aviso a una URL de notificación con este modo y la consulta al banco (403).

## Seguridad: el aviso del banco no tiene firma
El aviso (`POST` a la URL de notificación) no trae firma ni hash ni autenticación. Es el mismo agujero que tiene pesca:
cualquiera puede mandar `Estado: REALIZADA`. Reglas:
1. **Nunca creer el cuerpo.** Confirmar con `confirmarPago()`: consulta `GET /transaction/{id}` con las credenciales de la
   cuenta y exige que exista, esté REALIZADA y que el monto coincida exactamente con el de la orden.
2. La URL de retorno del navegador **solo muestra** el estado de la base. Nunca confirma.
3. Defensas extra (no sustituyen a la 1): token por orden o por cuenta en la URL del aviso, IPs de origen del banco
   (manual §3; dos de las diez parecen mal escritas: `200.68.100.193/28` y `190.104.202.34/28`), transiciones de estado
   idempotentes, conciliación diaria de órdenes pendientes.
4. Detalles del aviso observados: el del **link** es `{type:"paid", transaction_id, created_at, payload:{external_reference}}`
   sin monto, con `transaction_id` correlativo (adivinable); el de **pago** trae `Monto`, `Estado`, `EstadoId`. En la muestra
   del panel, `Estado: "REALIZADA"` venía con `EstadoId: "2"` (que es EN_PAGO): contradictorio, otra razón para no creerle.
   Montos con punto (`1.00`) o con coma (`11074,60`): el parser acepta ambos (`montoACentavos`).
5. Estados: 1 CREADA, 2 EN_PAGO, 3 REALIZADA, 4 RECHAZADA, 5/6 ERROR_HASH, 7 EXPIRADA, 8 CANCELADA, 9 DEVUELTA,
   10 PENDIENTE, 11 VENCIDA.

Informe sobre pesca: `docs/pasarela/informe-vulnerabilidad-webhook-pesca.pdf`.

## Rutas del pago online (hechas, 2026-11-16)
Código: `core/pagos-online.ts` (núcleo), `routes/pagos.ts` (rutas, montadas en `/api/pagos` fuera de `moduloActivo`: el aviso llega aunque
el sitio esté en mantenimiento), migración `0018_ordenes_pago_cuenta.sql` (columnas `cuenta` y `referencia_externa`), `pages/PagoRetorno.tsx` en el front.
- **Pagar** — `POST /api/<módulo>/solicitud/pagar` (con sesión, en los 3 módulos): con la solicitud bloqueada y `aprobada`, el servidor calcula el
  importe, crea una orden **pendiente** con una referencia al azar `BOT-XXXXXXXXXXXX` (es el `TransaccionComercioId`) y devuelve
  `{referencia, formulario:{action, campos}}`. Cada intento crea una orden nueva; las abandonadas quedan pendientes hasta la conciliación.
- **Aviso** — `POST /api/pagos/webhook/:cuenta/:token`: responde siempre 200 (mismo cuerpo), valida el token de la cuenta (comparación
  en tiempo constante), saca del cuerpo **solo** la referencia (formato de pago o de link; todo lo demás se ignora) y llama a
  `procesarAviso`: consulta al banco con las credenciales de esa cuenta y exige REALIZADA + monto exacto. **Si la consulta falla (hoy 403) la
  orden queda pendiente** (falla cerrado). Idempotente: la orden se bloquea, así que avisos repetidos o simultáneos confirman una sola vez.
  Tope de 120 pedidos por minuto por IP.
- **Enganche del módulo** — `registrarEnganchePago(slug, {cuentaPorDefecto, alConfirmarse})`. Dentro de la misma transacción pasa la solicitud a
  `pagada`, guarda `orden_id` y emite el certificado; devuelve el mail para mandar tras el commit. Si el enganche falla, el cobro **no se pierde**:
  la orden queda pagada con `datos.requiere_revision = true` (revisar a mano / devolver).
- **Retorno** — el banco vuelve a `<WEB_URL>/pagar/retorno?ref=…&r=exito|cancelado` (también sin datos del pago); la página consulta
  `GET /api/pagos/orden/:ref/estado` (solo devuelve el estado) y espera hasta 1 minuto. No confirma nada.
- **Cuenta de cada trámite** — `PAGOS_CUENTA_<MODULO>` en el `.env`; fitosanitarios usa FITOSANITARIO por defecto. Consultores y reservas
  todavía no tienen cuenta asignada (responden "pago online no habilitado").
- **Mock** — con `PAYMENT_PROVIDER=mock` no se arma formulario y existe `POST /api/pagos/mock/:ref/pagar` (solo local, nunca en producción)
  que simula el aviso confirmado. En producción la API exige `PAYMENT_PROVIDER=macroclick`.
- **Probado** (base local, 25 casos): referencias y formulario, token malo, cuenta/referencia inexistente o con formato raro, 403 real del banco
  (sigue pendiente), banco simulado con monto distinto / EN_PAGO / otra transacción / RECHAZADA, pago correcto, aviso repetido, tres avisos
  simultáneos, falla del módulo. **Recorrido real de un módulo** (consultores, solicitud aprobada, API local): `pagar` devuelve el formulario con el monto cifrado y crea la orden pendiente con la cuenta; el aviso con token correcto pero con el banco real en 403 deja la orden pendiente y la solicitud aprobada; con el proveedor mock, la confirmación deja la orden pagada, el pago, el comprobante, la solicitud emitida con su certificado y el mail "pago recibido". Además `GET /sesion/estado` devolvió 1800 s. **No probado en el navegador:** el botón "Pagar" del front (compila; usa el mismo envío de formulario oculto que se probó a mano con el banco).

## Pago de varias solicitudes en una sola orden (hecho, 2026-11-16)
Decisión de negocio (titulares-y-certificados.md, 4.4): las solicitudes **aprobadas** de una persona se pagan juntas con **una sola orden** cuyo total es la **suma de las tasas**; las que siguen en revisión no frenan a las demás y se pagan después en otra orden.
- **API** (los 3 módulos): `POST /api/<módulo>/persona/pagar` con `{numeros: [...]}` (sesión de persona; entre 1 y 50). Solo se aceptan solicitudes de ese mail, todas **aprobadas**
  y con tarifa; se bloquean ordenadas por id. El servidor calcula el total; la orden guarda `datos.solicitudes` (ids), el detalle en `tarifas` (una línea por solicitud, con el
  importe de ese momento) y `ref_id` null si son varias. Si alguna no sirve, error y no se crea ninguna orden. `GET /persona/mis-titulares` ahora trae `importeCentavos` en las aprobadas.
- **Confirmación:** el enganche del módulo recorre `datos.solicitudes`; cada una en su propio savepoint, así que una que falle (por ejemplo, ya no está aprobada) no tira abajo a las demás.
  El cobro nunca se pierde: la orden queda pagada con `datos.requiere_revision = true` y `datos.fallidas` con el motivo. Sale **un solo mail** con todos los certificados emitidos.
- **Front** (`Mis certificados` ×3): casilla en cada solicitud aprobada (con su tasa) y una barra con el total y el botón "Pagar lo elegido", que usa el mismo `BotonPagar`.
- **Probado** (base local, consultores): tablero con importes; rechazos (lista vacía, solicitud de otro mail, ya emitida, mezcla) sin crear órdenes; lote de 2 → una orden de $24.000 con 2 líneas →
  confirmación: 1 pago, 1 comprobante, 2 solicitudes emitidas, 1 mail; falla parcial (una solicitud pasa a rechazada antes de confirmar) → 1 emitida, orden `requiere_revision`;
  en el navegador: marcar 2 casillas muestra "2 solicitudes elegidas… Total $24.000,00" y el botón maneja el caso sin formulario. **No probado:** el envío real al sandbox desde esa pantalla.
- Las órdenes de lote muestran en Recaudaciones el identificador "Lote de N: números…". **No hay descuento** por pagar varios a la vez (decidido 2026-11-16: son trámites, no una venta): el total es la suma de las tasas.

## Conciliación diaria (hecha, 2026-11-16)
`npm run pagos:conciliar` (código: `core/conciliacion.ts` + `core/conciliar-pagos.ts`). **Correrla una vez por día desde el cron del servidor** (usa el mismo `.env`), junto a las tareas de cada módulo.
Recorre las órdenes con cuenta y referencia que quedaron sin resolver y le pregunta al banco por cada una (la misma consulta y las mismas reglas que el aviso: estado REALIZADA y monto exacto):
- **REALIZADA con el monto exacto** → se confirma igual que un aviso (mismo código, mismo enganche del módulo): rescata pagos cuyo aviso se perdió.
- **RECHAZADA / EXPIRADA / CANCELADA / VENCIDA** → orden rechazada. **En curso** → no se toca.
- **El banco no la conoce** y la orden tiene más de 7 días → vencida (el contribuyente nunca llegó a pagar). Las menores de 15 minutos ni se consultan (puede estar pagando).
- **Pagos que llegan tarde:** las órdenes vencidas o rechazadas de los últimos 30 días se vuelven a mirar, y si el banco ahora dice REALIZADA pasan a pagadas. Lo mismo vale para un aviso: un pago confirmado por el banco siempre gana (solo la orden ya pagada o anulada a mano es definitiva).
- **Si el banco no responde** (hoy 403): no cambia NADA (cerrar órdenes sin poder preguntar podría tapar un pago real), corta a las 5 consultas fallidas seguidas y **sale con código 1** para que el cron/monitoreo avise.
- Deja auditoría (`pagos.auditoria`: `conciliacion` por corrida, `conciliacion.pagada|rechazada|vencida` por orden). Con `PAYMENT_PROVIDER=mock` no hace nada.
- **Estado del sistema** muestra alertas: la conciliación no corrió en 36 h o la última no pudo consultar al banco (solo en producción con macroclick), y cuántos cobros tienen `requiere_revision` (se resuelven a mano; al terminar, poner `requiere_revision` en false en `datos` de la orden).
- Probado en base local (17 casos con banco simulado, y la tarea contra el banco real: 403, nada cambia, código 1).

## Limpieza y guardas (2026-11-16)
- Se borró el adaptador viejo de un solo proveedor (`core/payments/index.ts`, `mock.ts`, `provider.ts`): el flujo real es `core/pagos-online.ts` + `core/payments/macroclick.ts`.
- **Guarda de arranque:** en producción con macroclick, la API no arranca si falta algún dato de la cuenta de un módulo (`exigirCuentasDePago`, mensaje con las variables que faltan). Probado.

## Prueba del botón contra el sandbox (2026-11-16)
Base local, solicitud aprobada de fitosanitarios, API con `PAYMENT_PROVIDER=macroclick` y la cuenta real de sandbox: el clic en "Pagar la tasa" crea la orden pendiente (cuenta FITOSANITARIO, importe $15.000 calculado por el servidor) y el navegador llega a `sandboxpp.asjservicios.com.ar` con "Tasa - solicitud FITO-…" y total $15.000,00. No se pagó con tarjeta (ya está verificado el pago real del formulario, y la confirmación depende de que el banco habilite la consulta).

## Pendiente (en este orden)
1. **Respuesta del banco**: habilitar consulta de transacciones (`GET /transaction/{id}` mínimo) en FITOSANITARIO, FORESTAL y
   pesca; confirmar "Botón integrado"; lista blanca de IP; autenticación de avisos. Repetir `/mcp__clickdepago__verify-setup`
   o `reprueba.mjs` para ver si pasó. Sin esto, los avisos no se pueden confirmar y **no se cobra en producción**.
2. ~~Botón "Pagar" en el front~~ **hecho (2026-11-16):** `components/BotonPagar.tsx` + `lib/enviar-formulario.ts`, cableado en `Solicitud.tsx` de los 3 módulos (`api.pagar`);
   con `VITE_PAGO_SIMULADO=1` sigue saliendo el botón simulado. Falta probarlo en el navegador contra el sandbox con una solicitud aprobada real.
3. Dar de alta en el panel del banco la URL de notificación de cada cuenta (`https://<dominio>/pagos/api/pagos/webhook/<CUENTA>/<token>` (detrás del proxy de ecodatos la API cuelga de `/pagos/api`)) y
   generar los `WEBHOOK_TOKEN` en el servidor (distintos de los locales).
4. Filtro por IP de origen del aviso (opcional, dos de las diez IP del manual parecen mal escritas).
5. ~~Conciliación diaria~~ **hecha (2026-11-16)**, ver abajo.
6. ~~Varias renovaciones en una sola orden~~ **hecho (2026-11-16)**, ver abajo.
7. Asignar cuenta a consultores y reservas; probar el recorrido real de cada módulo con el sandbox.
8. Preguntas menores al banco: Botón Simple (Ente 795502, URL `:8110` sin respuesta), botón "Tutoriales" del panel roto.

## Pruebas útiles
- Sandbox: tarjeta Visa crédito `4500000000000007` 08/30 CVV 123 aprueba; Mastercard `5299910010000015`; Visa débito
  `4062900000000016`; Maestro `501051000000000086` (< $65.000); Visa débito `4092300000000005` rechaza montos > $65.000.
- Avisos: el panel del sandbox permite mandar un aviso de prueba a una URL (webhook.site); un link con `notification_url`
  avisa al pagarse.
- MCP `clickdepago` (en `.mcp.json`, configurado como el README; `create_payment_link` falla porque no manda `back_url`).
- Correr scripts con `env -i PATH="$PATH" HOME="$HOME" node --env-file=.env ...`: el shell puede tener variables `PAGOS_*`
  viejas que pisan el `.env`.
