// Tareas programadas de fitosanitarios. Se corre una vez por día (cron del servidor):
//   npm run avisos -w @botonera/api
//   - Avisos de vencimiento de certificados (30 y 7 días antes, y al vencer), sin repetir.
//   - Aprobaciones sin pago vencidas pasan a `vencida`.
//   - Limpia sesiones y enlaces viejos.
import { procesarTareasDiarias } from '../src/modules/fitosanitarios/avisos.js';
import { pool } from '../src/db.js';

try {
  const r = await procesarTareasDiarias();
  console.log(JSON.stringify(r));
} finally {
  await pool.end();
}
