export type Kind = 'paso' | 'concepto' | 'documento' | 'campo';

export type Proceso = {
  id: number;
  titulo: string;
  tipo?: string;
  area?: string;
  estado?: string;
  web?: string;
  prioridad?: string;
  volumen?: string;
  responsable?: string;
  contacto?: string;
  norma?: string;
  disparador?: string;
  descripcion?: string;
  hoy?: string;
  notas?: string;
  actualizado?: string;
  items: Record<Kind, Record<string, string>[]>;
  guia?: { clave: string; hecho: number; nota: string }[];
  cuenta?: Partial<Record<Kind, number>>;
};

type Campo = { k: string; label: string; tipo?: 'texto' | 'largo' | 'lista'; opciones?: string[]; ancho?: number };

export const TIPOS = ['Multa', 'Tasa / arancel', 'Certificado', 'Trámite', 'Derecho / canon', 'Otro'];
export const ESTADOS = ['Por relevar', 'En relevamiento', 'Relevado', 'Validado con el área'];
export const WEB = ['A definir', 'Sí, va por la web', 'No, queda afuera'];
export const PRIORIDAD = ['Alta', 'Media', 'Baja'];

export const SECCIONES: { kind: Kind; titulo: string; ayuda: string; agregar: string; campos: Campo[] }[] = [
  {
    kind: 'paso', titulo: 'Pasos del proceso', agregar: 'Agregar paso',
    ayuda: 'El circuito de punta a punta, en orden. Incluí los pasos que no son del pago (inspección, acta, etc.).',
    campos: [
      { k: 'titulo', label: 'Paso' },
      { k: 'quien', label: 'Quién lo hace', tipo: 'lista', opciones: ['Contribuyente', 'Ministerio', 'Banco / proveedor de pago', 'Otro organismo'] },
      { k: 'plazo', label: 'Plazo' },
      { k: 'descripcion', label: 'Qué pasa en este paso', tipo: 'largo' },
      { k: 'notas', label: 'Notas', tipo: 'largo' },
    ],
  },
  {
    kind: 'concepto', titulo: 'Conceptos a pagar (tasas, multas, aranceles)', agregar: 'Agregar concepto',
    ayuda: 'Cada cosa por la que se cobra plata dentro de este proceso.',
    campos: [
      { k: 'nombre', label: 'Concepto' },
      { k: 'tipoMonto', label: 'Cómo se calcula', tipo: 'lista', opciones: ['Monto fijo', 'Escala / tabla', 'Fórmula', 'Lo define el acta o la inspección', 'Otro'] },
      { k: 'monto', label: 'Monto (o valor de referencia)' },
      { k: 'formula', label: 'Fórmula / detalle del cálculo', tipo: 'largo' },
      { k: 'vencimiento', label: 'Vencimiento / recargos' },
      { k: 'cuenta', label: 'Cuenta de destino' },
      { k: 'norma', label: 'Norma que fija el monto' },
      { k: 'notas', label: 'Notas', tipo: 'largo' },
    ],
  },
  {
    kind: 'documento', titulo: 'Documentos y certificados', agregar: 'Agregar documento',
    ayuda: 'Lo que presenta el contribuyente y lo que emite el ministerio (certificados, constancias, boletas).',
    campos: [
      { k: 'nombre', label: 'Documento' },
      { k: 'direccion', label: 'Quién lo aporta', tipo: 'lista', opciones: ['Lo presenta el contribuyente', 'Lo emite el ministerio', 'Lo emite otro organismo'] },
      { k: 'obligatorio', label: 'Obligatorio', tipo: 'lista', opciones: ['Sí', 'No', 'Depende'] },
      { k: 'vigencia', label: 'Vigencia' },
      { k: 'notas', label: 'Notas (firma, QR, numeración…)', tipo: 'largo' },
    ],
  },
  {
    kind: 'campo', titulo: 'Datos que se piden en el formulario web', agregar: 'Agregar dato',
    ayuda: 'Los campos que la persona tendría que completar para pagar. Marcá cuáles se buscan en la base: si ese dato no existe, no se deja pagar.',
    campos: [
      { k: 'nombre', label: 'Dato' },
      { k: 'tipo', label: 'Tipo', tipo: 'lista', opciones: ['Texto', 'Número', 'Fecha', 'CUIL / CUIT', 'DNI', 'Lista de opciones', 'Archivo adjunto', 'Otro'] },
      { k: 'obligatorio', label: 'Obligatorio', tipo: 'lista', opciones: ['Sí', 'No'] },
      { k: 'enBase', label: '¿Tiene que existir en la base para poder pagar?', tipo: 'lista', opciones: ['No, solo se completa', 'Sí, en un registro', 'Sí, es la deuda a pagar'] },
      { k: 'fuente', label: 'Registro o sistema donde se busca (si aplica)' },
      { k: 'validacion', label: 'Validación de formato / de dónde sale' },
      { k: 'notas', label: 'Notas', tipo: 'largo' },
    ],
  },
];
