export type Seccion = { titulo: string; intro: string; items: { clave: string; texto: string; alcance?: 'proceso' }[] };

// Guía de qué relevar. Las claves identifican cada punto en la base; no cambiarlas una vez usadas.
export const GUIA: Seccion[] = [
  {
    titulo: '1. Inventario de pagos',
    intro: 'Primero, la lista de TODO lo que cobra el ministerio. Cada línea es un proceso en la pestaña Procesos; el detalle viene después.',
    items: [
      { clave: 'inv-areas', texto: 'Listar las áreas/direcciones del ministerio que cobran algo (forestal, fitosanitaria, fauna, fiscalización, mesa de entradas…)' },
      { clave: 'inv-por-area', texto: 'Por cada área: qué multas, tasas, aranceles, certificados y derechos cobran' },
      { clave: 'inv-volumen', texto: 'Estimar cuántos pagos por mes tiene cada proceso (define la prioridad)' },
      { clave: 'inv-actual', texto: 'Cómo se paga hoy cada uno: ventanilla, transferencia, boleta de banco, Rapipago, sistema propio…' },
      { clave: 'inv-fuera', texto: 'Marcar qué NO va por la web (ej. licencia de pesca, que tiene sistema aparte) y por qué' },
      { clave: 'inv-sistemas', texto: 'Sistemas existentes que ya manejan alguno de estos cobros (para integrar o evitar duplicar)' },
    ],
  },
  {
    titulo: '2. Por cada proceso',
    intro: 'Se completa en la ficha de cada proceso. Esto es el checklist de qué preguntar.',
    items: [
      { clave: 'proc-resp', texto: 'Quién es el responsable del proceso y su contacto', alcance: 'proceso' },
      { clave: 'proc-norma', texto: 'Norma que lo habilita (ley, decreto, resolución) y si los montos están en una norma', alcance: 'proceso' },
      { clave: 'proc-pasos', texto: 'Los pasos del circuito de punta a punta, y quién hace cada uno (contribuyente, ministerio, banco)', alcance: 'proceso' },
      { clave: 'proc-gen', texto: 'Qué dispara el pago: un acta, un trámite iniciado, una solicitud, una inspección', alcance: 'proceso' },
      { clave: 'proc-monto', texto: 'Cómo se calcula el monto: fijo, escala, fórmula (ej. por hectárea, por m³, por unidad de multa)', alcance: 'proceso' },
      { clave: 'proc-actual', texto: 'Qué se hace hoy cuando pagan y qué se emite después (certificado, constancia, habilitación)', alcance: 'proceso' },
      { clave: 'proc-docs', texto: 'Qué documentos o datos hay que presentar antes de poder pagar', alcance: 'proceso' },
      { clave: 'proc-requisito', texto: 'Qué se tiene que cumplir para dejar pagar: ¿alcanza con completar el formulario (libre), hay que figurar en un registro, o hay una deuda previa (acta, expediente)?', alcance: 'proceso' },
      { clave: 'proc-registro', texto: 'Si exige registro: cuál es, quién lo mantiene, si está digital y de dónde se puede leer, qué estados habilitan (activo) y cuáles no (baja, suspendido)', alcance: 'proceso' },
      { clave: 'proc-deuda', texto: 'Si hay deuda previa: dónde está cargada (sistema, planilla, papel), con qué dato se busca (acta, CUIT, expediente) y quién la carga', alcance: 'proceso' },
      { clave: 'proc-alcorriente', texto: 'Si además se exige estar al día con pagos anteriores o no tener deudas en otros trámites', alcance: 'proceso' },
      { clave: 'proc-minimos', texto: 'Qué datos se pueden mostrar antes de pagar para que la persona confirme que es ella (razón social, estado) y cuáles no (domicilio, teléfono, deudas)', alcance: 'proceso' },
      { clave: 'proc-tercero', texto: 'Si puede pagar un tercero (contador, familiar) o solo el titular', alcance: 'proceso' },
      { clave: 'proc-venc', texto: 'Vencimientos, recargos, intereses, descuentos por pago anticipado', alcance: 'proceso' },
      { clave: 'proc-parcial', texto: 'Si se admiten pagos parciales, cuotas o planes de pago', alcance: 'proceso' },
      { clave: 'proc-devol', texto: 'Qué pasa con devoluciones, pagos duplicados o errores', alcance: 'proceso' },
      { clave: 'proc-ident', texto: 'A quién se le cobra: persona física, empresa, ambos; qué identificación se pide (CUIL/CUIT, DNI)', alcance: 'proceso' },
    ],
  },
  {
    titulo: '3. Cuentas y destino de los fondos',
    intro: 'Define cómo se reparte la plata y cómo se concilia.',
    items: [
      { clave: 'cta-cuentas', texto: 'En qué cuenta bancaria cae cada concepto (puede haber varias por área o fondo)', alcance: 'proceso' },
      { clave: 'cta-afectado', texto: 'Si hay fondos afectados o porcentajes que se reparten entre cuentas/organismos', alcance: 'proceso' },
      { clave: 'cta-conc', texto: 'Quién concilia hoy los pagos y con qué frecuencia' },
      { clave: 'cta-contab', texto: 'Qué necesita Contaduría/Tesorería: formato de reportes, códigos de recurso, imputación presupuestaria' },
      { clave: 'cta-fact', texto: 'Si hay que emitir factura o recibo oficial, y con qué numeración' },
    ],
  },
  {
    titulo: '4. Comprobantes y certificados',
    intro: 'Qué sale después del pago.',
    items: [
      { clave: 'cmp-tipos', texto: 'Qué comprobante o certificado se entrega por cada pago', alcance: 'proceso' },
      { clave: 'cmp-firma', texto: 'Si requiere firma (digital u ológrafa), sello, QR o numeración correlativa', alcance: 'proceso' },
      { clave: 'cmp-valid', texto: 'Si terceros (ej. un inspector) tienen que poder verificar el comprobante', alcance: 'proceso' },
      { clave: 'cmp-plantilla', texto: 'Conseguir una copia de cada formulario/certificado/boleta actual', alcance: 'proceso' },
    ],
  },
  {
    titulo: '5. Usuarios y operación',
    intro: 'Quién va a usar el panel de administración.',
    items: [
      { clave: 'op-roles', texto: 'Qué perfiles hacen falta en el panel (por área, por módulo, auditor, tesorería)' },
      { clave: 'op-altas', texto: 'Quién carga actas, deudas o tarifas, y quién las puede modificar' },
      { clave: 'op-reportes', texto: 'Qué reportes necesitan (diario, por área, por concepto) y para quién' },
      { clave: 'op-soporte', texto: 'Quién atiende al contribuyente cuando algo falla y por qué canal' },
    ],
  },
  {
    titulo: '6. Técnico y legal',
    intro: 'Cosas que condicionan el desarrollo.',
    items: [
      { clave: 'tec-macro', texto: 'Manual técnico de MacroClick, datos del comercio, credenciales de prueba y producción' },
      { clave: 'tec-medios', texto: 'Qué medios de pago habilita MacroClick (tarjetas, débito, QR, transferencia) y comisiones' },
      { clave: 'tec-dominio', texto: 'Dónde se va a alojar y bajo qué dominio; quién administra el servidor' },
      { clave: 'tec-registros', texto: 'Acceso a los registros y bases que validan los trámites (tabla propia, importación periódica o consulta a otro sistema como Ecodatos) y quién autoriza el acceso' },
      { clave: 'tec-datos', texto: 'Normativa de datos personales aplicable y quién autoriza el tratamiento' },
      { clave: 'tec-botones', texto: 'Quién maneja la página del ministerio donde van los botones y cómo se enlazan' },
    ],
  },
];
