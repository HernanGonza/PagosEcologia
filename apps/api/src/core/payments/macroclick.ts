import type { PaymentProvider } from './provider.js';

// TODO: implementar con la documentación técnica de Macro Click de Pago
// (alta de operación, firma/hash, URLs de retorno y notificación).
export const macroClickProvider: PaymentProvider = {
  async crearPago() {
    throw new Error('MacroClick: pendiente de implementar');
  },
  async procesarWebhook() {
    throw new Error('MacroClick: pendiente de implementar');
  },
};
