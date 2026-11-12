# Pasarelas de pago (Click de Pago / Macro)

Estado: **plan, sin código todavía** (faltan credenciales de sandbox). Fuentes: manual BM50377 (jun25), colección Postman
y el sistema de pesca (Laravel, `macro-pesca.txt`).

## Decisiones tomadas
- **Un solo driver, tres cuentas.** Un cliente de Click de Pago en `apps/api/src/core/payments/`, instanciado una vez por cuenta
  (credenciales, token y URL de webhook propios). Es transversal, por eso va en lo general y no en un módulo.
- **Cada módulo declara el nombre de su pasarela** (`cuentaPago`) cuando se arma. Cada trámite cobra en una cuenta distinta.
- **Credenciales de las 3 cuentas en el `.env` único**; la cuenta elegida por el módulo toma las suyas.
- **Checkout por redirección completa**: se redirige al contribuyente a la página de Macro y vuelve por `back_url`.
  Iframe y ventana emergente (`postMessage`, como pesca) quedan como mejora si en sandbox se comprueba que funcionan.
- **Modalidad principal: Link de pago** (`POST /v1/link-pago`). Alternativa por cuenta: formulario POST con AES + SHA-256
  (el que usa pesca), solo si el banco no habilita el link en alguna cuenta.

## Pendiente de definir
- Nombres de las 3 cuentas y qué trámite va a cada una: `<CUENTA_1>`, `<CUENTA_2>`, `<CUENTA_3>` (completar).

## `.env` (por cuenta)
```
PAGOS_<CUENTA>_PROVEEDOR=mock|clickdepago
PAGOS_<CUENTA>_AMBIENTE=sandbox|produccion     # por cuenta: una puede salir antes que otra
PAGOS_<CUENTA>_MODALIDAD=link|formulario
PAGOS_<CUENTA>_GUID=
PAGOS_<CUENTA>_FRASE=
PAGOS_<CUENTA>_SUCURSAL=0000000000
PAGOS_<CUENTA>_WEBHOOK_TOKEN=                  # va en la URL del webhook
```
- Reemplaza el `PAYMENT_PROVIDER` global. Al arrancar se valida que cada cuenta usada tenga todo; la pantalla **Estado** del
  sistema marca en rojo lo que falte. Nunca se loguean `guid` ni `frase`.
- Base sandbox: `https://sandboxpp.asjservicios.com.ar:8082/v1`. Producción: `https://botonpp.asjservicios.com.ar:8082/v1`.
  (El Postman usa `sandboxpp.macroclickpago.com.ar`: confirmar con el banco.)

## Flujo con Link de pago
1. El módulo llama a "pagar": se crea la orden en `pagos.ordenes_pago` (con la **cuenta**) y se pide el link:
   `external_reference` = id de la orden (único por comercio), `total` en centavos, `due_date` ≤ 72 h, `back_url`, `notification_url`.
2. Se redirige al contribuyente a la `url` devuelta (`https://[URL_BASE]/Link/<uuid>`).
3. Webhook: `POST /api/pagos/webhook/:cuenta/:token`. **No tiene firma**, así que:
   - se filtra por las IPs de origen del manual §3 (con `TRUST_PROXY`);
   - **no se confía en el cuerpo**: se vuelve a consultar estado y monto a la API con las credenciales de esa cuenta;
   - recién ahí, en transacción (idempotente por `unique(proveedor, referencia_externa, estado)`), se marca la orden pagada
     y se llama al enganche del módulo (`emitirCertificado`);
   - se responde siempre 200.
4. `back_url`: solo muestra el estado leyendo la base (se actualiza sola). **Nunca confirma un pago.**
5. Conciliación: tarea diaria que consulta las órdenes pendientes viejas por si el webhook no llegó.

El core no importa módulos: cada módulo registra su enganche al arrancar (respeta [módulos autónomos]).

## Autenticación y estados de Click de Pago
- `POST /sesion` `{guid, frase}` → JWT (≈ 4 h) en `Authorization: Bearer`; también devuelve `secretKey` (solo la usa el formulario).
  Se guarda el token en memoria por cuenta y se renueva ante 401.
- Estados: 1 CREADA, 2 EN_PAGO, 3 REALIZADA, 4 RECHAZADA, 5/6 ERROR_HASH, 7 EXPIRADA, 8 CANCELADA, 9 DEVUELTA, 10 PENDIENTE, 11 VENCIDA.
- Webhook de link: `{type: paid|rejected|expired|canceled|refunded, transaction_id, payload.external_reference}`.
- Webhook de pago: `TransaccionComercioId`, `EstadoId`, `Monto`, etc. (manual §3).

## Migración prevista
- Columna `cuenta` en `pagos.ordenes_pago`; probablemente estado `devuelto`. Anotar en `pagos._migraciones`.

## Preguntas para el banco
- GUID, frase y número de sucursal de las **3 cuentas**.
- ¿Link de pago habilitado en las tres, o solo el formulario?
- Dominio de sandbox correcto (asjservicios vs macroclickpago).
- Alta de la URL de notificación de cada cuenta (hace falta URL pública HTTPS; en desarrollo, túnel).
- ¿Se puede embeber el checkout (iframe) desde nuestro dominio? ¿Las cuentas admiten devoluciones?
- Cómo se consulta el estado de un **link** (¿`/transaction/search` por `identificadorTransaccionInterno`?): se prueba en sandbox.

## Para probar apenas haya credenciales
- MCP `clickdepago` (en `.mcp.json`, sandbox): `health_check`, `verify_credentials`, `create_payment_link`.
- `curl -I` a un link generado: ver si hay `X-Frame-Options` / `frame-ancestors`.

## Referencia: sistema de pesca
Usa el formulario POST (no el link): campos cifrados con AES + `Hash` SHA-256 (IP, secretKey, comercio, sucursal, monto) hacia
`https://sandboxpp.asjservicios.com.ar/`, ventana emergente + `postMessage`. Su webhook **no valida nada** (cualquiera puede
mandar `Estado: REALIZADA`): avisar a quien lo mantiene. El algoritmo exacto está en la librería `PlusPagos`, que no vino en el txt.
