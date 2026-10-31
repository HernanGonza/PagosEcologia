export interface CrearPagoInput {
  ordenId: string;
  /** Importe en CENTAVOS (como las tarifas y las órdenes). */
  monto: number;
  descripcion: string;
  urlRetorno: string;
}

export interface CrearPagoResult {
  /** URL del checkout a la que se redirige al contribuyente. */
  urlPago: string;
  referenciaExterna: string;
}

export interface PaymentProvider {
  crearPago(input: CrearPagoInput): Promise<CrearPagoResult>;
  /** Valida y normaliza la notificación del proveedor. */
  procesarWebhook(headers: Record<string, unknown>, body: unknown): Promise<{ ordenId: string; estado: 'pagado' | 'rechazado' | 'pendiente' }>;
}
