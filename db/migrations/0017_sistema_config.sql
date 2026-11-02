-- Configuración general del sistema, que maneja el equipo técnico desde apps/sistema:
--   mantenimiento → {"activo": bool, "mensaje": text}: corta toda la página pública y sus APIs (los paneles
--                   de los técnicos y la verificación por QR siguen andando).
--   aviso         → {"activo": bool, "texto": text, "nivel": "info" | "alerta"}: franja arriba de la página pública.
-- Esquema `pagos` (propio de la botonera): no toca nada de Ecodatos.

create table pagos.sistema_config (
  clave          text primary key,
  valor          jsonb not null,
  actualizado_por text,
  updated_at     timestamptz not null default now()
);

insert into pagos.sistema_config (clave, valor) values
  ('mantenimiento', '{"activo": false, "mensaje": ""}'),
  ('aviso', '{"activo": false, "texto": "", "nivel": "info"}');
