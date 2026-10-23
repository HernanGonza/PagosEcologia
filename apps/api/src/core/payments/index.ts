import type { PaymentProvider } from './provider.js';
import { mockProvider } from './mock.js';
import { macroClickProvider } from './macroclick.js';

export const paymentProvider: PaymentProvider =
  process.env.PAYMENT_PROVIDER === 'macroclick' ? macroClickProvider : mockProvider;
