export type Seccion = { titulo: string; intro: string; items: { clave: string; texto: string }[] };

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
      { clave: 'proc-resp', texto: 'Quién es el responsable del proceso y su contacto' },
      { clave: 'proc-norma', texto: 'Norma que lo habilita (ley, decreto, resolución) y si los montos están en una norma' },
      { clave: 'proc-pasos', texto: 'Los pasos del circuito de punta a punta, y quién hace cada uno (contribuyente, ministerio, banco)' },
      { clave: 'proc-gen', texto: 'Qué dispara el pago: un acta, un trámite iniciado, una solicitud, una inspección' },
      { clave: 'proc-monto', texto: 'Cómo se calcula el monto: fijo, escala, fórmula (ej. por hectárea, por m³, por unidad de multa)' },
      { clave: 'proc-actual', texto: 'Qué se hace hoy cuando pagan y qué se emite después (certificado, constancia, habilitación)' },
      { clave: 'proc-docs', texto: 'Qué documentos o datos hay que presentar antes de poder pagar' },
      { clave: 'proc-venc', texto: 'Vencimientos, recargos, intereses, descuentos por pago anticipado' },
      { clave: 'proc-parcial', texto: 'Si se admiten pagos parciales, cuotas o planes de pago' },
      { clave: 'proc-devol', texto: 'Qué pasa con devoluciones, pagos duplicados o errores' },
      { clave: 'proc-ident', texto: 'A quién se le cobra: persona física, empresa, ambos; qué identificación se pide (CUIL/CUIT, DNI)' },
    ],
  },
  {
    titulo: '3. Cuentas y destino de los fondos',
    intro: 'Define cómo se reparte la plata y cómo se concilia.',
    items: [
      { clave: 'cta-cuentas', texto: 'En qué cuenta bancaria cae cada concepto (puede haber varias por área o fondo)' },
      { clave: 'cta-afectado', texto: 'Si hay fondos afectados o porcentajes que se reparten entre cuentas/organismos' },
      { clave: 'cta-conc', texto: 'Quién concilia hoy los pagos y con qué frecuencia' },
      { clave: 'cta-contab', texto: 'Qué necesita Contaduría/Tesorería: formato de reportes, códigos de recurso, imputación presupuestaria' },
      { clave: 'cta-fact', texto: 'Si hay que emitir factura o recibo oficial, y con qué numeración' },
    ],
  },
  {
    titulo: '4. Comprobantes y certificados',
    intro: 'Qué sale después del pago.',
    items: [
      { clave: 'cmp-tipos', texto: 'Qué comprobante o certificado se entrega por cada pago' },
      { clave: 'cmp-firma', texto: 'Si requiere firma (digital u ológrafa), sello, QR o numeración correlativa' },
      { clave: 'cmp-valid', texto: 'Si terceros (ej. un inspector) tienen que poder verificar el comprobante' },
      { clave: 'cmp-plantilla', texto: 'Conseguir una copia de cada formulario/certificado/boleta actual' },
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
      { clave: 'tec-auth', texto: 'Requisitos para Mi Argentina (alta como aplicación, ambiente de prueba, quién tramita)' },
      { clave: 'tec-datos', texto: 'Normativa de datos personales aplicable y quién autoriza el tratamiento' },
      { clave: 'tec-botones', texto: 'Quién maneja la página del ministerio donde van los botones y cómo se enlazan' },
    ],
  },
];
