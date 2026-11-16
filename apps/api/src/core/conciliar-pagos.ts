// Tarea diaria (cron del servidor, usa este mismo .env):  npm run pagos:conciliar
// Sale con código 1 si el banco no respondió, para que el cron/monitoreo avise.
import { pool } from '../db.js';
import { conciliar } from './conciliacion.js';

const r = await conciliar();
if (r.omitida) {
  console.log(r.omitida);
} else {
  console.log(`Conciliación: ${r.revisadas} órdenes revisadas · ${r.pagadas} confirmadas · ${r.rechazadas} rechazadas · ${r.vencidas} vencidas · ${r.siguenPendientes} siguen pendientes · ${r.errores} sin respuesta del banco.`);
  if (r.bancoNoResponde) console.error('El banco no respondió a las consultas: no se cambió nada. Revisar la habilitación de la consulta de transacciones.');
}
await pool.end();
process.exit(r.bancoNoResponde ? 1 : 0);
