import type { PaymentProvider } from './provider.js';

export const mockProvider: PaymentProvider = {
  async crearPago({ ordenId }) {
    return { urlPago: `/pago-simulado/${ordenId}`, referenciaExterna: `mock-${ordenId}` };
  },
  async procesarWebhook(_h, body) {
    const b = body as { ordenId: string; estado: 'pagado' | 'rechazado' | 'pendiente' };
    return { ordenId: b.ordenId, estado: b.estado };
  },
};
