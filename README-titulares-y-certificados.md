# Titulares, certificados y renovaciones (diseño, NO implementado)

> ## ⚠️ Esto es un diseño para revisar, no código
> Nada de lo que sigue está construido. Parte de lo que ya existe (solicitudes, enlaces, sesiones; ver
> [`README-mails-y-seguridad.md`](README-mails-y-seguridad.md)) y propone cómo agregar **registro de
> titulares, certificados con vencimiento, historial y renovaciones**.
>
> **El pago y la emisión del certificado tampoco están implementados** y este diseño depende de ellos:
> un certificado se crea al emitirse, y renovar implica pagar la tasa de nuevo. Los formularios y requisitos
> actuales son provisorios y se van a corregir; este diseño no depende de su contenido, solo de que
> existan **datos del titular**, **datos del objeto certificado** (vehículo, local, depósito) y **documentos**.

---

## 1. Qué se necesita (lo que se pidió)

1. Empezar el registro **desde cero**: la primera vez se pide toda la documentación.
2. Después poder **buscar por DNI, CUIT, etc.** y ver lo que tiene vigente, los vencimientos, y el **historial** de certificados.
3. **Renovar** (la renovación **paga tasa de nuevo**; **pasa por revisión si algún documento está vencido**).
4. Los certificados duran **12 meses**.
5. **Varias personas pueden actuar por una misma empresa.**

---

## 2. Lo que hay hoy y por qué no alcanza

| Hoy | Problema |
|---|---|
| DNI/CUIT, nombre y domicilio viven como texto libre en `fito_solicitudes.datos` (jsonb) | No se puede decir "es el mismo titular" entre solicitudes; no hay unicidad ni validación centralizada. |
| El acceso es por **mail → una solicitud** (enlace o sesión de una solicitud) | Un titular con varios certificados o una empresa con varias personas no tiene "dónde entrar". |
| Una solicitud termina en `emitida` y ahí se acaba | No existe el **certificado**: sin fecha de emisión ni vencimiento, no hay qué buscar ni qué renovar. |
| Los documentos no tienen fecha de vencimiento | No se puede saber si un documento está vencido (póliza de seguro, habilitación municipal…). |
| No hay proceso programado | Nadie avisa que un certificado está por vencer. |

---

## 3. Modelo propuesto

### 3.0 Dónde vive cada cosa: Ecodatos (datos) y `pagos` (trámite y pagos)

**Decidido:** el **registro** vive en **Ecodatos** (esquema `public`, la plataforma donde el área ve toda la información, por ejemplo el registro de fitosanitarios). El esquema **`pagos`** guarda el trámite y los pagos. Son dos esquemas de **la misma base**, y la botonera trabaja con los dos.

| Dónde | Qué guarda | Por qué ahí |
|---|---|---|
| **Ecodatos (`public`)** | **Titulares**, **vínculos** mail ↔ titular, el **registro** de objetos con su estado actual (fecha de registro y fecha de vencimiento, que se pisa) y el **historial** de certificados emitidos (con el código del QR). La tabla `public.fitosanitarios_domisanitarios` se **reconfigura** como el registro (hoy está vacía, así que se puede rediseñar sin migrar datos). | Es el registro: lo que el área consulta y busca (por DNI, CUIT…) en Ecodatos. |
| **`pagos`** | **Órdenes de pago y comprobantes**, **tarifas** (editables por Recaudaciones), y el **trámite**: solicitudes, sus documentos y observaciones, el historial de estados, los códigos de verificación, los enlaces de un solo uso y las sesiones. | Es el proceso y el dinero. Los enlaces, sesiones y códigos son datos de acceso de la botonera (hashes, IP, navegador): no tienen por qué estar en Ecodatos. |

*(La ubicación de las solicitudes es una suposición mía; ver preguntas abiertas.)*

**Cómo se combinan los dos esquemas:**
- Es **la misma base de datos**, así que una sola transacción puede escribir en los dos. Al **emitir**, se crea el certificado en Ecodatos y se marca la solicitud como emitida en `pagos` **o pasan las dos cosas o ninguna**.
- **Sin claves foráneas entre esquemas** (principio que ya se usaba): el certificado guarda `solicitud_id` y `orden_id` como referencia simple, y la solicitud guarda `certificado_id`. Así Ecodatos no queda bloqueado por filas nuestras ni al revés; la API valida la referencia.
- **La botonera accede con permisos mínimos** (rol `botonera`): en las tablas nuevas de Ecodatos puede leer e insertar, y modificar solo las columnas que le corresponden (por ejemplo `revocado_en` no). Como hasta ahora, con políticas propias para `botonera` que no cambian lo que ve nadie más.
- **Quién ejecuta el SQL de Ecodatos:** las tablas de `public` son de la plataforma Ecodatos, así que el SQL que las crea o reconfigura va en un archivo aparte (marcado como "Ecodatos") para que lo **revise y aplique quien mantiene esa plataforma**, antes de la fase 1.
- **La definición de "vigente"** (6.2) se escribe **una sola vez, en Ecodatos** (una vista o función), así la usan igual Ecodatos, el panel de técnicos y la botonera.

### 3.0.1 En Ecodatos: el registro (estado actual) y el historial (todo lo emitido)

Dos tablas con roles distintos. Es una idea simple y sirve para los dos usos: **consultar rápido qué tiene vigente cada uno** y **conservar todo lo que se emitió**.

**1. El registro: `public.fitosanitarios_domisanitarios` (reconfigurada) — una fila por objeto registrado, con su estado actual.**
Se reconfigura (hoy está vacía) con la **fecha de registro** (la primera vez que se registró) y la **fecha de vencimiento del certificado actual**, que **se va pisando** con cada renovación. Así, buscar "¿qué tiene vigente este titular y cuándo vence?" es mirar una fila.

| Hoy | En el modelo nuevo |
|---|---|
| `empresa`, `direccion` | Pasan al **titular** (`fito_titulares`) o al objeto; la fila ya no repite el nombre de la empresa. |
| `tipo_id` (`tipos_fito_domi`) | Se **mantiene**: tipo de certificado (vehículo, comercio, depósito) según el catálogo de Ecodatos. |
| `nro_registro` | Se **mantiene** como número de registro del objeto (único). |
| `actividades` | Se mantiene, si el área lo sigue usando. |
| `anio_pago_registro` | **Se reemplaza** por las fechas de abajo. Se elimina el permiso de la botonera para escribir esa columna. |
| *(nuevas)* | `titular_id`, `objeto` + `objeto_etiqueta` (por ejemplo el dominio), **`fecha_registro`** (no cambia), **`vence_en`** (**se pisa** al emitir cada certificado nuevo), `revocado_en`/motivo. |

**2. El historial: `fito_certificados` (nueva) — una fila por certificado emitido, que no se pisa nunca.**
Guarda cada certificado con su `vigente_desde`, `vence_en`, `emitido_en`, `renovado_de`, `solicitud_id`, `orden_id`, `codigo_verificacion` (el del QR) y el PDF. Es la **historia completa** del objeto: de ahí salen el historial de renovaciones y la verificación por QR. Una vez emitido, no se modifica (salvo marcar una revocación).

**Cómo se mantienen consistentes:** al emitir, **en una sola transacción** se inserta el certificado en el historial y se actualiza `vence_en` en el registro. Como la fecha del registro es un dato **derivado** del historial, hay una vista de control que compara las dos fuentes, y una verificación periódica que avisa si alguna vez difieren.

**Por qué alcanza una sola fecha de vencimiento en el registro:** una renovación anticipada empieza justo al vencimiento del anterior, así que la cobertura es continua y alcanza con guardar hasta cuándo está cubierto el objeto. Una renovación tardía deja un hueco entre un vencimiento y la nueva emisión, y mientras esa fecha estuvo en el pasado el objeto figuraba vencido, que es lo correcto. El historial conserva los períodos exactos, incluido el hueco.

**Hay que confirmar con quien mantiene Ecodatos** que ninguna pantalla o formulario de la plataforma dependa de las columnas que se reemplazan (que la tabla esté vacía no alcanza si el código de Ecodatos las lee).

### 3.1 Titular (`fito_titulares`, en Ecodatos)

La persona física o jurídica a nombre de quien se emite el certificado. **Una sola fila por titular**, sin importar cuántas solicitudes haga.

- `tipo_persona`: `fisica` | `juridica`.
- `cuit` (11 dígitos, validado con su dígito verificador) y `dni` (personas físicas), ambos **normalizados** (solo números), cada uno **único** cuando existe.
  - Una persona física puede buscarse por DNI **o** por CUIT: el CUIT contiene el DNI (`20-DNI-x`), así que al cargar uno se deriva el otro cuando se pueda.
- `nombre` (nombre o razón social), `telefono`, `domicilio`, fechas de alta y última actualización.

Hoy esos datos se piden en cada solicitud (`identificador`, `titular`, `telefono`, `domicilio`). Pasarían a pedirse **una vez** (alta del titular) y a **reutilizarse**.

### 3.2 Vínculos mail ↔ titular (`fito_vinculos`, en Ecodatos)

El DNI o CUIT **agrupa** (todas las solicitudes y certificados del mismo documento son del mismo titular, con cualquier mail) pero **no es una llave de acceso**: un DNI no es secreto. Lo que da acceso es un **mail verificado que esté vinculado** al titular.

- Una fila por (`titular_id`, `email`): `aprobado_por` (el técnico), `aprobado_en`, y `baja_en` / `baja_por` / motivo. Nunca se borra: queda el historial.
- **Cuándo se crea el vínculo:** solo cuando **un técnico aprueba una solicitud** de ese mail para ese DNI/CUIT. Como el registro arranca de cero y se pide toda la documentación (constancia de CUIT/DNI y, cuando quien presenta no es el titular, el **poder firmado**), esa revisión es la prueba de identidad. Hasta entonces el mail ve **solo sus propias solicitudes**, nunca las del titular.
- **Por qué no alcanza con escribir el CUIT:** si el vínculo naciera al cargar el dato, cualquiera podría iniciar una solicitud con el CUIT de otro y ver sus certificados. Con la aprobación, ese intento queda en revisión y se rechaza.
- **Varias personas por empresa:** un empleado nuevo hace su solicitud con el mismo CUIT y sus documentos, el técnico la aprueba y su mail queda vinculado. No hace falta un sistema de invitaciones.
- Una persona física normalmente tiene un solo mail vinculado; si usa otro, hace una solicitud con ese mail y se aprueba igual.
- El DNI y el CUIT de una misma persona física se vinculan juntos (el CUIT contiene el DNI).

**Bajas (decisión tomada):**
- **Cada uno puede darse de baja a sí mismo**, sin trámite.
- **Dar de baja a otra persona lo resuelve un técnico**; un representante puede pedirlo desde su tablero y el técnico lo aprueba. Todo queda registrado.
- Al dar de baja se cierran las sesiones de ese mail sobre ese titular.
- El último vínculo activo de un titular no puede darse de baja sin que un técnico intervenga.

### 3.3 Certificado (historial `fito_certificados` + estado actual en el registro; en Ecodatos)

Lo que se emite al terminar una solicitud (`emitida`). **Se emite uno por objeto**: un vehículo, un local, un depósito (los tipos actuales son `vehiculo`, `comercio` y `deposito`). Un titular con 20 vehículos tiene 20 objetos registrados, cada uno con su historial de certificados.

**Historial (`fito_certificados`, una fila por certificado, no se pisa):**
- `registro_id` (el objeto en `fitosanitarios_domisanitarios`), `titular_id`, `tipo`, `numero` (propio, legible, único).
- `solicitud_id` y `orden_id` (referencias simples, sin clave foránea entre esquemas).
- **`vigente_desde`** y **`vence_en`** = `vigente_desde` + **12 meses**, calculados en el servidor con fecha de Argentina (ver 4.4). `emitido_en` es la fecha de emisión, que puede ser anterior a `vigente_desde`.
- `renovado_de` (el certificado anterior de la misma cadena, o null): la cadena es el **historial** de un objeto, sin depender de comparar textos como "dominio". Un certificado solo puede ser renovado **una vez** (`renovado_de` único).
- `revocado_en` / motivo (para anular un certificado emitido por error o por infracción; nunca se borra).
- `codigo_verificacion`: código **al azar e impredecible** (128 bits) que va en el **QR** (ver 4.6). No es el `numero`: el número es legible y correlativo y no debe servir para adivinar otros certificados.
- El PDF emitido (ruta en el bucket privado), con el QR impreso.

**Estado actual (en el registro):** `vence_en` del objeto, que se pisa en cada emisión (3.0.1).

**El estado se calcula, no se guarda.** Para una fecha `hoy` (Argentina):
- **Del objeto** (lo que se muestra en la ficha del titular): *revocado* si tiene `revocado_en`; *vigente* si `hoy <= vence_en`; *vencido* si no.
- **De un certificado puntual** (historial y verificación por QR): *revocado*, *por comenzar* (`hoy < vigente_desde`), *vigente* (`vigente_desde <= hoy <= vence_en`) o *vencido*.

Es la misma lección que con `aprobacion_vence`: si el estado depende de un proceso que lo actualice, queda desactualizado entre corridas. Todo (panel, búsqueda, avisos, renovación) usa **una sola definición** compartida, escrita en Ecodatos (6.2).

### 3.4 Documentos con vencimiento (en `pagos`, con la solicitud)

Hoy `fito_documentos` no guarda cuándo vence un documento. Se agrega `vence_en` (date, opcional).

- En la **configuración de cada requisito** se marca cuáles son documentos que vencen (`venceEn: true`): al subirlos, la persona **carga la fecha de vencimiento** (ej. la póliza de seguro vigente hasta tal fecha). Los que no vencen (ej. constancia de CUIT) no la piden.
- **Caso confirmado: la VTV de los vehículos.** Es un documento con `vence_en`. Como la VTV puede vencer antes que el certificado (que dura 12 meses), la fecha de la VTV vigente se **copia al registro del objeto** (`vtv_vence_en`, junto a `objeto_etiqueta` = patente) para mostrarla sin buscar en `pagos`. Se actualiza al emitir cada certificado, en la misma transacción (3.0.1), y al renovar se exige VTV vigente: si la cargada venció, la renovación pasa a revisión y se pide la nueva.
- Un documento está *vencido* si `vence_en < hoy` (Argentina).
- Los documentos del **titular** (constancia de identidad) se asocian al titular y se reutilizan en todas sus solicitudes; el **poder firmado** (PDF, sin escribano, **no vence**) se asocia al **vínculo** de cada mail (cada representante presenta el suyo) y **nunca se considera vencido**, por lo que no genera revisión en las renovaciones; los del **objeto** (cédula, seguro, habilitación) a la solicitud y al certificado resultante, y se **arrastran** a la renovación.

---

## 4. Flujos

### 4.1 Primera vez (registro desde cero)

1. Verificación del mail (código), como hoy.
2. Se piden los **datos del titular** (DNI o CUIT, nombre, teléfono, domicilio) y sus **documentos** (constancia de identidad y, cuando quien presenta **no es el titular** —una empresa o un apoderado—, un **poder firmado en PDF** que acredite que puede actuar en su nombre; alcanza con subirlo: **no requiere escribano y no vence**), más los del objeto del certificado.
3. **Toda solicitud nueva pasa por revisión técnica.** Al aprobarla, el técnico además **aprueba el vínculo** de ese mail con el DNI/CUIT:
   - Si el titular **no existía**, se crea y el mail queda vinculado.
   - Si **ya existía** (otro mail ya está vinculado), la solicitud se revisa igual, con su poder firmado, y al aprobarla el mail queda vinculado. Mientras tanto no ve nada del titular.
4. **Pago** → emisión: crea el **certificado** (`vence_en` = emisión + 12 meses).

Todo el flujo actual de solicitudes (enlaces, sesión, avisos) sigue igual; lo nuevo es que **la solicitud cuelga de un titular** (por su DNI/CUIT normalizado) y **al emitirse crea un certificado**.

### 4.2 Búsqueda (panel de técnicos)

Por **DNI, CUIT, nombre/razón social, número de certificado, dominio**, etc. La ficha del titular muestra:

- datos y representantes (activos y dados de baja);
- **certificados vigentes** con días para el vencimiento (ordenados por los que vencen antes) y **vencidos**;
- **historial** de cada objeto (la cadena de renovaciones) y sus solicitudes;
- documentos con su vencimiento y cuáles están vencidos.

**Cada consulta al padrón queda registrada** (quién, qué buscó, cuándo): son datos personales (Ley 25.326) y el panel es la parte con privilegios.

### 4.3 Consulta del propio titular (parte pública)

Después de verificar el mail, la persona ve **los titulares de los que es representante**: sus certificados, vencimientos e historial. **La búsqueda libre por DNI/CUIT no es pública**: permitiría averiguar quién tiene certificados (enumeración). Solo se ve lo asociado al mail verificado.

> Esto cambia el modelo de acceso (ver 6.1).

### 4.4 Renovación

**Uno o varios certificados a la vez, y los pagos se suman.**

1. Desde un certificado dentro de la ventana de renovación (de 30 días antes a 30 días después del vencimiento), el representante elige **Renovar**; puede **seleccionar varios** (por ejemplo, toda la flota de una empresa).
2. Cada certificado seleccionado genera su **propia solicitud de renovación** (`renueva_certificado_id`), **precargada** con los datos del titular, el objeto y los documentos del certificado anterior. Cada una tiene su estado y, si hace falta, su propia revisión.
3. **¿Pasa por revisión técnica?** Regla pedida: **si algún documento está vencido, sí**. Regla implementada:
   - **Sin revisión** (se aprueba sola, con actor `sistema`, y pasa directo al pago) si **todos** los documentos requeridos siguen vigentes **y** la persona **no cambió ningún dato ni subió ningún documento nuevo**.
   - **Con revisión** si algún documento requerido está vencido (hay que subir uno nuevo), o si cambió datos o subió documentos nuevos. La revisión puede limitarse a lo que cambió.
   - Como cada certificado es una solicitud aparte, en un lote **unos pueden pasar sin revisión y otros quedar en revisión**.
4. **Pago: se suman los importes (decidido).** Las solicitudes aprobadas del lote se agrupan en **una sola orden de pago** (`solicitud.orden_id` ya permite que varias solicitudes apunten a la misma orden) cuyo total es la **suma de las tasas**. Las que todavía están en revisión **no frenan** a las demás: **se paga primero lo aprobado y, cuando el técnico apruebe el resto, se paga después** (cada tanda es otra orden de pago). **Tasas (decidido):** los valores reales todavía no existen. Se cargan **valores de prueba (mock)**, claramente marcados como tales, que **Recaudaciones modifica desde el panel central**. El sistema ya guarda las tarifas versionadas (`pagos.tarifas`: concepto, valor, `vigente_desde`, `creado_por`; rige la última con `vigente_desde` <= hoy) y la orden de pago guarda qué versión se usó, así que un cambio posterior no altera lo ya cobrado. Habría un concepto por tipo y por situación (por ejemplo `alta-vehiculo` y `renovacion-vehiculo`) para poder cobrar distinto el alta y la renovación. **Hoy el panel central muestra las tarifas pero no encontré un lugar donde se editen**: habría que construir esa edición (con el permiso de Recaudaciones, sin borrar versiones y dejando auditoría).
5. Al emitirse, se crea un **certificado nuevo** por cada solicitud, con `renovado_de` = el anterior.
6. **"Renovación automática"** se entiende como: aviso previo + solicitudes ya armadas + salteo de la revisión cuando corresponde. **No** como cobro ni emisión sin que la persona confirme y pague.

**Desde cuándo vale el certificado nuevo (decisiones tomadas):**
- **Renovación anticipada** (el anterior sigue vigente): el nuevo vale **desde el vencimiento del anterior**, **sin importar cuándo se pagó**. `vigente_desde` = día siguiente a `vence_en` del anterior y `vence_en` = `vigente_desde` + 12 meses. Pagar antes no acorta ni alarga nada.
- **Renovación tardía** (el anterior venció hace 30 días o menos): el nuevo vale **desde la emisión**, **sin cobertura retroactiva**. `vigente_desde` = fecha de emisión (en Argentina). Entre el vencimiento del anterior y esa fecha el objeto queda sin certificado vigente.
- **Anticipación máxima: 30 días.** Solo se puede iniciar la renovación de un certificado vigente cuando faltan **30 días o menos** para su vencimiento; así no se apilan renovaciones de años. Un certificado ya vencido se puede renovar **hasta 30 días después de su vencimiento**; pasado ese plazo **no se renueva: se empieza de nuevo** con un alta completa (todos los requisitos y documentos, como la primera vez), que genera un certificado nuevo sin `renovado_de`. Los avisos de vencimiento se ajustan a esa ventana (ver 4.5).

### 4.5 Avisos de vencimiento

Un **proceso programado** (cron/worker, el que ya estaba pendiente) busca certificados que vencen en 30 y 7 días (la renovación solo se habilita a 30 días del vencimiento; 4.4; los valores exactos se pueden ajustar) y también los ya vencidos y manda un mail con el enlace para renovar **al mail de la solicitud que originó el último certificado** de esa cadena (decidido). Si ese mail fue dado de baja del titular, el aviso va a los mails vinculados que sigan activos. Se registra qué aviso se mandó para no repetirlo. El mismo proceso:

- avisa si un documento está por vencer o venció;
- marca las aprobaciones sin pago como `vencida` (pendiente desde antes) y reintenta los mails fallidos.

Los certificados vencidos no se "actualizan" para que el estado sea correcto (ya es calculado); el proceso solo avisa.

---

### 4.6 QR de verificación pública (decidido: sí)

Cada certificado emitido lleva impreso un **código QR**. Al escanearlo se abre una página pública (`/verificar/<codigo_verificacion>`) que dice si el certificado es **auténtico y qué estado tiene hoy**. Sirve para que un inspector, una municipalidad o un tercero verifique en el momento que un papel no es falso o está vencido.

- **Qué muestra** (confirmado): número de certificado, tipo, objeto (para un vehículo, la **patente**, y además el **vencimiento de la VTV**), fechas de vigencia y **estado calculado hoy** (*vigente*, *por comenzar*, *vencido*, *revocado*), y el **nombre o razón social del titular** (coherente con los "datos mínimos" que ya usa el sistema para que alguien confirme que es el titular correcto). **No** muestra DNI/CUIT, domicilio, teléfono, mails ni documentos.
- **Seguridad:** el QR lleva el `codigo_verificacion` (impredecible), no el número correlativo; no hay listado ni búsqueda en esa página; un código inexistente da siempre la misma respuesta genérica; tope de pedidos por IP; sin cookies ni sesión; `Cache-Control: no-store` para que un certificado revocado o vencido no se siga mostrando como vigente.
- Un certificado **revocado** se ve como revocado; uno **reemplazado por una renovación** se ve como vencido o por comenzar según corresponda (el estado es siempre el calculado, nunca uno guardado).

### 4.7 Panel de técnicos: primera vez y renovaciones (decidido)

Revisan **los mismos técnicos** que hacen la revisión de la primera vez (cualquiera de ellos, no necesariamente el que revisó el certificado anterior). El listado de solicitudes del panel se **divide en dos**: **primera vez** (altas, incluidas las que "empiezan de nuevo" pasados los 30 días) y **renovaciones** (solicitudes con `renueva_certificado_id`). Cada lista tiene sus filtros, conteos y badge de pendientes; el flujo de revisión, observación, aprobación y rechazo es el mismo.

---

## 5. Seguridad y privacidad

| Riesgo | Medida propuesta |
|---|---|
| Averiguar quién tiene certificados buscando por DNI/CUIT | La búsqueda por documento es **solo del panel**. En la parte pública solo se ve lo asociado al mail verificado. |
| Que alguien reclame un titular ajeno escribiendo su CUIT/DNI | El vínculo mail ↔ titular se crea **solo cuando un técnico aprueba la solicitud**, con la documentación de identidad y el poder firmado. Antes de eso el mail no ve nada del titular. |
| Representante que ya no corresponde (se fue de la empresa) | Baja registrada (a sí mismo, libre; a otro, la aprueba un técnico). Se cierran las sesiones de ese mail sobre el titular. |
| Dos titulares duplicados | DNI y CUIT únicos y normalizados; CUIT con dígito verificador. |
| Certificado emitido por error | Revocación con motivo y auditoría; nunca se borra. |
| Consultas abusivas del padrón por técnicos | Registro de cada consulta; revisar accesos inusuales. |
| Datos personales conservados de más | Definir retención (titulares, documentos, certificados, accesos) y mencionarla en el aviso de privacidad. |
| Estado de certificado desactualizado | Estado **calculado** contra la fecha de Argentina, con una sola definición compartida. |
| Verificar que un certificado es auténtico | Opcional: consulta pública por **número de certificado** (con código QR en el PDF) que dice solo *vigente/vencido/revocado*, sin datos personales. |

---

## 6. Decisiones de arquitectura

### 6.1 El acceso deja de ser "por solicitud" y pasa a ser "por persona"

Hoy: mail verificado → enlace/sesión de **una** solicitud. Con titulares y varios certificados hace falta un **tablero**: una persona debe ver todos sus titulares, certificados y solicitudes. Propuesta:

- Al verificar el mail, se abre una **sesión de persona** (la cookie ya existente, atada al **mail** en vez de a una solicitud) con acceso a todo lo asociado a ese mail.
- Los **enlaces de un solo uso** de los mails siguen existiendo y llevan directo a una solicitud o certificado concretos (canjean esa sesión).
- Se mantiene todo lo ya resuelto: cookie `HttpOnly`/`__Host-`, `SameSite`, `Origin`, vencimiento por inactividad y máximo, un solo uso, sesión nueva cierra la anterior.

Es el cambio más grande de seguridad y conviene hacerlo **antes** de construir encima.

### 6.2 Una sola definición de "vigente"

Un único lugar que define *certificado vigente / por comenzar / vencido / revocado*, *documento vencido* y *solicitud que admite enlace*, usado por la parte pública, el panel, los avisos y el cron. Evita repetir el problema de `vencida`. **El estado del certificado se define en Ecodatos** (vista o función SQL), porque es ahí donde se consulta el registro; la botonera la usa tal cual en vez de reescribirla.

### 6.3 Registro desde cero, sin importar datos viejos

Como se arranca de cero y a todos se les pide todo, **no hay importación** ni se cargan certificados anteriores en papel (decidido).

---

## 7. Fases (estado)

> Fases 0.5 a 6: **construidas** (ver secciones 9 a 11). Sigue pendiente todo lo que depende del pago, que no existe. La tabla se deja como referencia del plan original.

| Fase | Contenido | Depende de |
|---|---|---|
| 0 | Correr las migraciones pendientes (`0009`, `0010`, `0011`; ver **9. Migraciones listas para correr**) y las verificaciones de producción de `README-mails-y-seguridad.md` | — |
| 0.5 | **SQL de Ecodatos — hecho: `0010_ecodatos_registro.sql`** (titulares, vínculos, registro reconfigurado, historial de certificados, estado y permisos del rol `botonera`). | — |
| 1 | **Titulares y vínculos**: unicidad y validación de DNI/CUIT, vínculo mail ↔ titular al aprobar, bajas; las solicitudes cuelgan de un titular; búsqueda en el panel con registro de consultas | formularios (provisorios sirven para empezar) |
| 2 | **Sesión de persona y tablero** (6.1) | Fase 1 |
| 3 | **Documentos con vencimiento** | Fase 1 |
| 4 | **Certificados**: creación al emitir, estado calculado, historial, ficha en el panel, revocación | **Pago y emisión (no existen)** |
| 5 | **Renovación** con revisión condicional | Fases 3 y 4, pago |
| 6 | **Cron**: avisos de vencimiento, vencimiento de aprobaciones, reintento de mails, limpieza de borradores | Fase 4 |

Las fases 1 a 3 se pueden hacer sin que exista el pago. La 4 en adelante necesita la emisión.

---

## 8. Decisiones tomadas y preguntas abiertas

### Decididas

| Tema | Decisión |
|---|---|
| Dónde vive el registro | En **Ecodatos** (esquema `public`): titulares, vínculos, el **registro** (estado actual, con fecha de registro y fecha de vencimiento que se pisa en cada renovación) y el **historial de certificados emitidos**. En **`pagos`**: pagos, tarifas y el trámite. La tabla `fitosanitarios_domisanitarios` **se reconfigura** (está vacía). |
| Formularios y requisitos | Se dejan como están (provisorios); se corrigen después. El diseño no depende de su contenido. |
| Varias personas por empresa | Sí. Cada mail se vincula al titular cuando un técnico aprueba su solicitud. |
| Quién aprueba el vínculo | Un técnico, en **toda solicitud nueva**. |
| Bajas | Cada uno a sí mismo, libre; a otro, la aprueba un técnico. |
| Duración | Los certificados duran **12 meses**. |
| Renovación | **Una o varias a la vez**, con **pagos que se suman** (una orden de pago con el total). Paga la tasa de nuevo. |
| Revisión en la renovación | Obliga a revisión si algún documento está vencido, si se **cambia un dato** o si se sube un documento nuevo. Sin cambios y con documentos vigentes, se aprueba sola. |
| Vigencia del certificado renovado | Si se renueva con anticipación: **desde el vencimiento del anterior**, sin importar cuándo se pagó. Si se renueva tarde (ya venció): **desde la emisión**, sin cobertura retroactiva. |
| Ventana para renovar | Desde **30 días antes** hasta **30 días después** del vencimiento. Pasado eso, **se empieza de nuevo** (alta completa). |
| Lotes con revisión | Se **paga lo aprobado** y, cuando se aprueba el resto, se paga después. |
| Poder de cada representante | **Cada uno presenta el suyo.** |
| Acreditar la representación | Un **poder firmado en PDF** (cuando quien presenta no es el titular): sin escribano y **no vence**. |
| Qué se verifica del poder | Los técnicos **leen el PDF**; no hay otra verificación. |
| Avisos de vencimiento | Van al **mail de la solicitud que originó el último certificado**. |
| Quién revisa las renovaciones | **Los mismos técnicos** que revisan la primera vez. El panel separa **primera vez** y **renovaciones** (4.7). |
| QR en el certificado | **Sí**: el PDF lleva un QR que abre una página pública de verificación (4.6). |
| Tasas | **Valores mock** editables por Recaudaciones desde el **panel financiero**; la edición hay que construirla (4.4). |
| Documentos que vencen | Confirmado uno: la **VTV** de los vehículos. Los demás todavía no se saben; **si los hay, se agregan campos de vencimiento a esos requisitos** (3.4): se activa por configuración de cada requisito. |
| Quién mantiene Ecodatos | **El responsable del proyecto** (el mismo que la botonera): cambia el código de Ecodatos que lea las columnas reemplazadas y revisa/aplica el SQL de la fase 0.5. No hace falta coordinar con terceros. |
| Qué se muestra de un vehículo | La **patente** y el **vencimiento de la VTV**, en la ficha del titular, en la búsqueda y en la verificación por QR (3.4). La VTV es un documento que vence. |
| Quién edita las tasas | **Recaudaciones, desde el panel financiero** (4.4). |
| Certificados anteriores en papel | **No se cargan**: se empieza de cero. No hay importación. |

### Abiertas

1. **Ecodatos (resuelto en lo esencial):** el responsable del proyecto también maneja Ecodatos, así que adapta el código que dependa de las columnas reemplazadas y aplica el SQL él mismo. Falta solo confirmar **(d)** que las **solicitudes y los accesos** (enlaces, sesiones, códigos) se quedan en `pagos` (suposición: son el trámite y los datos de acceso de la botonera, y a Ecodatos llega el resultado: titular, vínculo, registro y certificado). Si se quieren **ver las solicitudes también en Ecodatos**, se puede dar acceso de lectura sin mover las tablas.
   - Los restos del primer diseño se eliminaron: `pagos.fito_renovaciones` y la tarifa `renovacion-anual` (migración 0011), y el endpoint `GET /certificados/:identificador`. También se quitó `GET /tarifa` (leía `renovacion-anual` y no lo usaba ningún front).
2. **Otros documentos que vencen:** la VTV está confirmada; faltan los demás (seguro, habilitación municipal…). Cuando se sepan, hay que marcarlos con campo de vencimiento. Mientras no se marquen, no se consideran vencidos y no mandan la renovación a revisión.
3. **QR:** datos confirmados (4.6): número, tipo, objeto (para un vehículo, la **patente**), vigencia, estado y nombre del titular; para vehículos, también el **vencimiento de la VTV**. Nada más.
4. **Tasas:** se editan desde el **panel financiero**. Falta definir qué usuarios de Recaudaciones tienen permiso y si hay descuento por renovar varios certificados a la vez.

---

## 9. Migraciones listas para correr (preparadas, probadas en la base local)

Se aplican en orden con `npm run migrate` (rol `postgres`). Las tres corrieron completas en una base local nueva (`npm run db:local -- reset`) y se probó a mano el comportamiento de lo nuevo (abajo). **Todavía no están corridas en el servidor.**

| Archivo | Dónde | Qué hace |
|---|---|---|
| `0009_enlaces_y_sesiones.sql` | `pagos` | Enlaces de un solo uso y sesiones con cookie; email canónico; borra `token_hash` y `token_cifrado` (**los enlaces viejos dejan de servir**). Ver `README-mails-y-seguridad.md`. |
| `0010_ecodatos_registro.sql` | **Ecodatos (`public`)** | `fito_titulares`, `fito_vinculos`, `fito_certificados` (historial); reconfigura `fitosanitarios_domisanitarios` (quita `anio_pago_registro`; agrega `titular_id`, `objeto_etiqueta`, `datos`, `fecha_registro`, `vence_en`, `vtv_vence_en`, `revocado_*`); funciones y vistas de estado; permisos mínimos. |
| `0011_titulares_y_renovaciones.sql` | `pagos` | Solicitudes de alta/renovación y sus referencias; vencimiento y arrastre de documentos; sesión y enlace por persona; registro de consultas al padrón; avisos de vencimiento; config (renovación, VTV, poder); **tasas mock**; elimina restos del primer diseño. |

**Antes de correr en el servidor**

1. Hacer copia de la base (o un punto de restauración).
2. `0010` se **detiene sin cambiar nada** si `fitosanitarios_domisanitarios` tiene filas con `anio_pago_registro`. Revisar con: `select count(*) from public.fitosanitarios_domisanitarios;` (debería dar 0).
3. Cada migración corre en su propia transacción: si falla, esa no queda a medias.
4. Mirar si alguna pantalla o consulta de Ecodatos usa `anio_pago_registro` (se elimina) o `empresa` (deja de ser obligatoria, pero la columna **se mantiene**, igual que `direccion`, `orden` y `actividades`, para no romper nada mientras se adapta el código).
5. `0010` quita a `anon` y `authenticated` todo permiso sobre las tablas nuevas (son datos personales). Al final del archivo hay un bloque **comentado** para dar lectura al personal de Ecodatos si lo quieren.
6. Variables de entorno de la API ya requeridas por `0009`: `VERIFICACION_SECRETO` y `TRUST_PROXY`.

**Después de correr**

```sql
select * from public.fito_control_vigencia;          -- debe dar 0 filas
select concepto, valor from pagos.tarifas where creado_por = 'mock-inicial';   -- 4 tasas mock
select to_regclass('pagos.fito_renovaciones');       -- debe dar null
```

**Lo que se probó en la base local**

- CUIT con dígito verificador (acepta válidos, rechaza inválidos; una persona física con solo DNI es válida).
- DNI y CUIT únicos; jurídica exige CUIT.
- Al insertar un certificado, `vence_en` del registro se actualiza solo (también en una renovación anticipada); la vista de control da 0 diferencias.
- Un certificado emitido **no se puede modificar ni borrar**: solo marcar su revocación, una vez.
- `botonera` no puede escribir `vence_en` a mano (solo lo hace el trigger), ni borrar certificados.
- Estados calculados: vigente / revocado / etc.

**Tasas mock** (centavos, `creado_por = 'mock-inicial'`, rigen desde 2026-01-01): comercio $15.000, vehículo $8.000, depósito $20.000, fraccionamiento $25.000. Son de prueba; Recaudaciones carga las reales desde el panel financiero. **Falta construir esa edición** (hoy el panel solo lista las tarifas).

---

## 10. Qué está construido (API y front)

Todo lo de abajo **se probó de punta a punta** contra la base local (alta de un vehículo → aprobación → emisión → QR → búsqueda → renovación con y sin cambios → avisos → revocación → bajas). `npm run build` compila los cuatro front y la API.

| Parte | Dónde | Estado |
|---|---|---|
| Titular y vínculo al aprobar | `apps/api/.../titulares.ts`, `panel.ts` (`aprobar`) | ✔ Crea o reconoce al titular por DNI/CUIT (el CUIT de una persona física contiene el DNI) y vincula el mail. |
| Documentos con vencimiento (VTV) | `publico.ts`, `Solicitud.tsx` | ✔ Se pide la fecha al subir; se puede corregir; el poder firmado aparece solo si la persona dice que presenta en nombre del titular. |
| Emisión de certificados | `certificados.ts` | ✔ Una transacción: certificado + vencimiento del registro + estado de la solicitud. **La llama el pago, que no existe**: para probar hay una ruta de desarrollo (`EMISION_SIMULADA=1`, nunca en producción). |
| PDF con QR | `certificados.ts` (`pdfDeCertificado`) | ✔ Se arma al pedirlo (no se guarda): panel y tablero. Diseño provisorio. |
| Verificación pública (QR) | `GET /api/fitosanitarios/verificar/:codigo`, `Verificar.tsx` | ✔ Datos mínimos, código impredecible, tope por IP, 404 genérico. |
| Tablero "Mis certificados" | `persona.ts`, `MisCertificados.tsx` | ✔ Mail + código; ve solo los titulares a los que está vinculado; historial, PDF, bajas. |
| Renovación (una o varias) | `renovaciones.ts` | ✔ Solicitud precargada con documentos arrastrados; sin cambios y documentos vigentes → se aprueba sola; si no, la revisan los técnicos. Ventana de 30 días antes y 30 después. |
| Vigencia de la renovación | `emitirCertificado` | ✔ Anticipada: desde el día siguiente al vencimiento anterior. Tardía: desde hoy. |
| Panel: primera vez / renovaciones | `Lista.tsx` | ✔ Dos listas con filtros y conteos propios. |
| Panel: búsqueda y ficha | `Titulares.tsx`, `FichaTitular.tsx` | ✔ Por DNI, CUIT, nombre, certificado o patente; cada consulta queda en `pagos.fito_consultas_padron`. Revocar certificados y resolver bajas. |
| Avisos de vencimiento | `avisos.ts`, `npm run avisos` | ✔ 30 y 7 días antes y al vencer, un mail por casilla, sin repetir; reintenta los que fallaron. **Hay que programarlo en el cron del servidor** (una vez por día). |
| Tasas editables | `POST /api/admin/tarifas`, `Tramites.tsx` | ✔ "Cambiar valor" en el panel financiero: agrega una versión con fecha de vigencia y queda auditada. Como todo `/api/admin`, no responde hasta que el panel tenga login (hoy `ADMIN_SIN_LOGIN=true` solo en local). |

### Para dejar andando el lunes

1. Correr las migraciones (sección 9).
2. En el servidor: programar `npm run avisos` una vez por día.
3. Definir `VERIFICACION_SECRETO`, `TRUST_PROXY` y `WEB_URL` (la dirección pública: el QR del PDF y los mails la usan). **No** definir `EMISION_SIMULADA`.
4. Verificar en Ecodatos que el catálogo `tipos_fito_domi` tenga un tipo cuyo nombre empiece con *comercio*, *vehículo*, *depósito* y *fraccionamiento* (sin importar acentos): al emitir se busca así. Si falta, la emisión responde con un error claro y no emite.

### Lo que sigue sin hacerse

- **El pago** (MacroClick): sigue sin implementarse. Ahí hay que llamar a `emitirCertificado` cuando el pago se confirme, sumar las tasas de varias renovaciones en una orden y guardar `orden_id` en la solicitud y el certificado.
- **Login y permisos del panel financiero** (quién de Recaudaciones puede cambiar tasas).
- **Descuento** por renovar varios a la vez (sin definir).
- **Otros documentos que vencen** (seguro, habilitación): marcar `venceEn` en esos requisitos cuando se sepan.
- **Mail al emitir** con el certificado (hoy el mail de "pago recibido/emitido" lo hará el flujo de pago).
- Diseño final del PDF del certificado.
- Avisos a la persona cuando un técnico resuelve la baja de un representante.

---

## 11. Detalles técnicos y límites conocidos de lo construido

**Cómo se accede (cambia respecto de `README-mails-y-seguridad.md`)**
- Hay dos tipos de sesión, con **la misma cookie** (`HttpOnly`, `SameSite=Strict`, igual vencimiento): la de **solicitud** (viene de un enlace del mail) y la de **persona** (mail + código, para "Mis certificados"; el código se pide con `POST /codigo` y `para: 'persona'`). Abrir una reemplaza a la otra, y una sesión de persona nueva cierra las anteriores de esa casilla.
- Una sesión de persona abre solicitudes mandando el número en la cabecera `X-Solicitud`; la API solo la acepta si la solicitud es **de esa misma casilla**. Sin la cabecera, una sesión de persona no abre ninguna solicitud.
- Cualquiera de las dos sesiones prueba que la persona controla la casilla, así que ambas dan acceso a "Mis certificados" (solo los titulares a los que el mail está **vinculado**). La búsqueda por DNI/CUIT no es pública.
- Una renovación solo la **envía** quien sigue siendo representante (si lo dieron de baja después de armarla, se rechaza).
- Dar de baja al **último** representante de un titular lo resuelve un técnico; la baja de otro la pide un representante y la resuelve un técnico (sin mail de aviso todavía). Al dar de baja se cierran las sesiones de persona de esa casilla.

**Tablas nuevas en `pagos` (migración 0011)**: `fito_consultas_padron` (quién buscó qué; solo se agrega), `fito_avisos_vencimiento` (un aviso por certificado y umbral; sirve para no repetir y para reintentar), columnas nuevas en `fito_solicitudes`, `fito_documentos` (`vence_en`, `origen_documento_id`), `fito_sesiones` y `fito_enlaces` (ahora pueden ser de una casilla, no solo de una solicitud). `0009` además da `delete` al rol `botonera` sobre sesiones y enlaces.

**Documentos arrastrados**: en una renovación los documentos del certificado anterior **comparten el archivo** del original (`origen_documento_id`; la ruta es única solo entre originales). Cuentan de nuevo para el tope de espacio por casilla (300 MB). Si la persona sube uno nuevo, esa solicitud ya no se aprueba sola. El **poder** se toma de la solicitud que vinculó a esa persona, no del certificado.

**Reglas que conviene tener presentes**
- El certificado "actual" de un objeto es el **último de su cadena de renovaciones**; si ese fue revocado, el objeto no se puede renovar (hay que iniciar una solicitud nueva).
- Si pasó la ventana (30 días) y la persona empieza de nuevo con el mismo objeto del mismo titular (misma patente o dirección), **se reutiliza el objeto registrado**: el historial sigue siendo uno. Si la misma patente la registra **otro titular**, queda como otro objeto (puede haber dos con la misma patente; el panel los muestra bajo cada titular).
- `vence_en` del registro lo pisa un trigger al emitir; el rol `botonera` no puede escribirlo a mano. La vista `public.fito_control_vigencia` debe dar 0 filas.
- Un certificado emitido no se modifica ni se borra: solo se marca la revocación.
- El estado de aprobación sin pago vencida se calcula al leer; el cron diario además la deja en el historial.

**Límites**
- El tope de consultas a `/verificar` es **en memoria** y por instancia: con varias instancias, repetirlo en el proxy.
- El registro de consultas del padrón **no tiene retención** definida (Ley 25.326): falta decidir cuánto se conserva y limpiarlo.
- El PDF no se guarda (se arma cada vez); `pdf_ruta` queda sin usar. Si algún día se quiere un PDF inmutable, hay que guardarlo al emitir.
- Los avisos de vencimiento van al mail de la solicitud que originó el último certificado; si esa casilla ya no existe, el aviso no sale (no se busca otro representante).
- Si el mail de un aviso falla, queda con error y se reintenta en la corrida siguiente del cron.
- Las pantallas nuevas se probaron compilando y contra la API, **no en un navegador**: conviene recorrerlas con `npm run dev` antes de usarlas.
