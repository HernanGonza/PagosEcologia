-- Pago online con Click de Pago (varias cuentas, un driver):
--   cuenta             → nombre de la cuenta del banco que cobra esta orden (PAGOS_<CUENTA>_* en el .env).
--                        Null en los pagos simulados.
--   referencia_externa → TransaccionComercioId que se manda al banco. Es un código al azar (BOT-XXXXXXXXXXXX):
--                        el aviso del banco y la URL de retorno traen solo esto, nunca el id numérico de la orden.
-- Esquema `pagos` (propio de la botonera): no toca nada de Ecodatos.

alter table pagos.ordenes_pago
  add column cuenta text,
  add column referencia_externa text;

create unique index ordenes_pago_referencia_externa_uq
  on pagos.ordenes_pago (referencia_externa) where referencia_externa is not null;
