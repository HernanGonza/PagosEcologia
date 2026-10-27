export type Certificado = {
  numero: string;
  identificador: string;
  titular: string;
  actividad: string;
  emitido: string;
  vence: string;
};

// Registros ficticios para recorrer el módulo mientras se prepara la importación del Excel.
export const certificadosDemo: Certificado[] = [
  { numero: 'FITO-DEMO-2025-001', identificador: '20345678901', titular: 'Agro Norte SRL', actividad: 'Venta, transporte y aplicación', emitido: '2025-03-12', vence: '2026-03-12' },
  { numero: 'FITO-DEMO-2025-002', identificador: '30123456', titular: 'María Elena Gómez', actividad: 'Aplicación', emitido: '2025-09-04', vence: '2026-09-04' },
  { numero: 'FITO-DEMO-2024-003', identificador: '27234567894', titular: 'Juan Carlos Pérez', actividad: 'Transporte y aplicación', emitido: '2024-01-20', vence: '2025-01-20' },
];

export const PRECIO_DEMO = 25000;

export function normalizarIdentificador(value: string) {
  return value.replace(/\D/g, '');
}

export function buscarCertificado(value: string) {
  const needle = normalizarIdentificador(value);
  return certificadosDemo.find((item) => normalizarIdentificador(item.identificador) === needle) ?? null;
}
