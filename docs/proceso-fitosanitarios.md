# Trámite de fitosanitarios y domisanitarios — cómo funciona

Resumen para entender el trámite de punta a punta, quién interviene en cada paso y cómo se cuidan los datos.
Detalle técnico: `apps/api/src/modules/fitosanitarios/docs/`.

> **Estado:** el trámite completo funciona, **salvo el cobro en línea** (pasarela MacroClick), que está pendiente de
> recibir la documentación técnica. Hasta entonces el pago se simula en las pruebas. Requisitos, tipos de certificado
> y tasas son **provisorios** hasta que Control Ambiental los confirme.

---

## 1. La idea en pocas palabras

Una empresa o persona pide un certificado (para un **vehículo, comercio, depósito o fraccionamiento**), sube su documentación,
un técnico la revisa, paga la tasa y recibe el certificado en PDF con un **código QR**. El certificado dura **12 meses**
y se puede renovar. Todo queda registrado en Ecodatos.

**Quien pide el trámite no necesita crear una cuenta ni una contraseña.** Su identidad es su **mail**, que prueba con un
código que le llega a la casilla.

---

## 2. Cada parte tiene su propia dirección

El sistema son **cuatro aplicaciones separadas**, cada una con su dirección y su público. Así, quien entra a una no ve nada de las otras.

| Aplicación | Quién la usa | Cómo entra |
|---|---|---|
| **Página pública** (`/pagar/fitosanitarios`) | Empresas y ciudadanos | Sin cuenta: mail + código |
| **Panel de técnicos** | Técnicos de Control Ambiental | Usuario de Ecodatos |
| **Panel de Recaudaciones** | Contaduría | Usuario de Ecodatos, solo admin o área Recaudaciones |
| **Administración del sistema** | Administradores técnicos | Usuario de Ecodatos, solo admin/superadmin. No se enlaza desde ningún lado |

Los técnicos y Contaduría usan las mismas credenciales que ya tienen en Ecodatos. Contaduría no ve nada técnico y los
administradores técnicos no mezclan su pantalla con la de Recaudaciones.

---

## 3. El recorrido, paso a paso

### Primera vez
1. **La persona entra** a la página pública, elige el tipo de certificado y escribe su mail.
2. **Recibe un código de 6 números** por mail y lo escribe. Con eso abre su solicitud.
3. **Carga los datos del titular** (DNI o CUIT, nombre, domicilio) y los **documentos** (constancia de identidad; si presenta en nombre
   de otro, un poder firmado; y los del objeto, como la VTV con su fecha de vencimiento).
4. **Envía la solicitud.** Le llega un mail de confirmación.
5. **Un técnico la revisa** y puede *aprobar*, *pedir correcciones* o *rechazar*. Cada decisión le llega por mail.
   Al aprobar, el técnico además **autoriza que ese mail actúe por ese titular**.
6. **Paga la tasa** y el sistema **emite el certificado** (PDF con QR).

### Después de la emisión
- La persona entra a **"Mis certificados"** (mail + código) y ve sus certificados, vencimientos e historial, y puede bajar el PDF.
- Cualquiera con el papel puede **escanear el QR** y ver si es auténtico y si está vigente, vencido o revocado.
- **30 días antes, 7 días antes y al vencer**, el sistema manda un aviso por mail.

### Renovar
- Se puede renovar desde **30 días antes hasta 30 días después** del vencimiento. Pasado ese plazo se empieza de nuevo.
- Se pueden **renovar varios a la vez** (por ejemplo, toda la flota) y la tasa se paga una sola vez, sumada.
- Si los documentos siguen vigentes y no cambió ningún dato, **se aprueba sola**. Si algún documento venció o hubo cambios, **la revisa un técnico**.
- Renovar **paga la tasa de nuevo**.

---

## 4. Seguridad

### Sin contraseñas que robar
- El mail es la identidad y se prueba con un **código de 6 números**: dura 15 minutos, se puede intentar 5 veces y se gasta al usarlo.
  Se guarda cifrado, no se puede leer desde la base de datos.
- Para volver a una solicitud se usa un **enlace de un solo uso** que llega por mail. Una vez usado, no sirve más, aunque
  alguien lo reenvíe o lo encuentre en el historial del navegador. Todos los enlaces **vencen**.
- Si alguien intenta usar un enlace ya usado, la pantalla le dice **cuándo se usó**, para que el dueño detecte si entró otra persona.
- La sesión se cierra a los **30 minutos sin uso** y, como máximo, a las **4 horas**. Abrir la solicitud en otro dispositivo cierra la anterior.
- En la base de datos se guardan **solo huellas (hash)** de enlaces y sesiones: ni quien administra la base puede reconstruir un enlace.

### Los datos de un titular no se ven con solo saber su CUIT
- Escribir un DNI o CUIT **no da acceso a nada**. Un DNI no es secreto.
- El acceso a los certificados de un titular lo da **un mail aprobado por un técnico** contra la documentación presentada.
- **No hay buscador público** por DNI o CUIT: nadie puede averiguar quién tiene certificados.
- Los vínculos se pueden dar de baja (cada uno a sí mismo; a otro, con un técnico) y **nada se borra**: queda historial.
- Cada **consulta de un técnico al padrón queda registrada** (quién, qué buscó, cuándo), por tratarse de datos personales.

### Protección contra abusos
- **Límites por mail y por IP** en los pedidos de código (5 por hora por casilla, 20 por hora por IP), para que nadie llene casillas ajenas.
- Máximo de **3 borradores** por casilla y topes de tamaño de archivos (10 MB por archivo, 300 MB por casilla).
- Solo se aceptan **PDF, JPG y PNG**, y el tipo se comprueba por el **contenido real** del archivo, no por la extensión.
- Los documentos están en **almacenamiento privado**: los técnicos los ven con enlaces que **duran 10 minutos**.
- Las respuestas con datos personales no se guardan en caché del navegador, y la cookie de sesión no la puede leer ningún script de la página.

### Verificación del certificado (QR)
- El QR lleva un **código al azar impredecible**, no el número del certificado, así no se pueden adivinar otros.
- La página pública muestra solo lo necesario: número, tipo, patente o dirección, fechas, **estado de hoy** y nombre del titular. **No muestra DNI, CUIT, domicilio, teléfono ni mail.**

### Fechas y estados confiables
- Si un certificado está vigente o vencido **se calcula siempre con la fecha de hoy** en Argentina; no es un dato guardado que pueda quedar desactualizado.
- Los certificados emitidos **no se modifican ni se borran**. Un error se corrige revocándolo, con motivo, y la historia queda.

### Operación
- Si se apaga un módulo desde la administración del sistema, desaparece de la página pública, pero **no se borra nada** y los certificados ya emitidos siguen verificándose.
- Las migraciones de la base se anotan en un registro y la **API se niega a arrancar si falta alguna**. Tampoco arranca en producción con configuración de pruebas.

---

## 5. Dónde queda cada dato

| Dónde | Qué guarda |
|---|---|
| **Ecodatos** | Titulares, quién actúa por quién, el registro de cada vehículo/comercio/depósito y su vencimiento, y el **historial completo de certificados** |
| **Esquema `pagos` (de la botonera)** | La solicitud y sus documentos, observaciones, historial de estados, códigos, enlaces, sesiones, tasas y pagos |

Lo que el área consulta a diario (certificados, vencimientos, titulares) queda en Ecodatos. Lo propio del trámite y del dinero queda separado en `pagos`.

---

## 6. Qué falta

- **Cobro en línea (MacroClick):** necesitamos su manual técnico y las credenciales de pruebas. Hoy el pago no se puede hacer.
- **Requisitos, tipos y tasas definitivos:** los actuales son de prueba.
- **Probar el recorrido completo con usuarios reales** en el servidor.
- Mejoras previstas: registro de auditoría completo, reintento automático de mails fallidos, diseño final del PDF del certificado.
