// Tareas diarias de fitosanitarios. Se corre una vez por día desde el cron del servidor:
//   npm run fitosanitarios:tareas
//   - Avisos de vencimiento de certificados (30 y 7 días antes, y al vencer), sin repetir.
//   - Aprobaciones sin pago vencidas pasan a `vencida`.
//   - Limpia sesiones y enlaces viejos.
import { pool } from '../../db.js';
import { procesarTareasDiarias } from './avisos.js';

try {
  console.log(JSON.stringify(await procesarTareasDiarias()));
} finally {
  await pool.end();
}
