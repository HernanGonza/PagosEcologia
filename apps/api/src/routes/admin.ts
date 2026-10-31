import { Router } from 'express';
import {
  conceptosDeMonto,
  periodosAdmin,
  type AuditoriaAdmin,
  type ConfigModulo,
  type TarifaVersionAdmin,
  type OrdenAdmin,
  type OrdenesAdminResponse,
  type PeriodoAdmin,
  type ResumenAdmin,
  type TramiteAdmin,
} from '@botonera/shared';
import { pool } from '../db.js';

export const adminRouter = Router();

const TZ = 'America/Argentina/Buenos_Aires';

// Hasta que exista el login del panel, solo se habilita a mano en desarrollo local.
adminRouter.use((_req, res, next) => {
  if (process.env.ADMIN_SIN_LOGIN === 'true') return next();
  res.status(503).json({ error: 'El panel todavía no tiene login; habilitalo con ADMIN_SIN_LOGIN=true solo en local.' });
});

/** Fecha de hoy en Argentina, YYYY-MM-DD. */
function hoyAr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function rangoDe(periodo: PeriodoAdmin) {
  const hasta = hoyAr();
  if (periodo === 'anio') {
    const desde = `${hasta.slice(0, 4)}-01-01`;
    const anioAnterior = String(Number(hasta.slice(0, 4)) - 1);
    return { desde, hasta, desdeAnterior: `${anioAnterior}-01-01`, hastaAnterior: `${anioAnterior}${hasta.slice(4)}` };
  }
  const dias = periodo === 'hoy' ? 1 : periodo === '7d' ? 7 : 30;
  const desde = sumarDias(hasta, -(dias - 1));
  return { desde, hasta, desdeAnterior: sumarDias(desde, -dias), hastaAnterior: sumarDias(desde, -1) };
}

// Pagos confirmados con su fecha local. Un webhook 'pagado' por orden (ver unique en pagos.pagos).
const PAGADOS = `
  with pagados as (
    select o.id, o.modulo_slug,
           coalesce(p.importe_centavos, o.importe_centavos) as importe,
           (p.created_at at time zone '${TZ}') as pagado_local
      from pagos.pagos p
      join pagos.ordenes_pago o on o.id = p.orden_id
     where p.estado = 'pagado'
  )`;

const ORDEN_SELECT = `
  select o.id, o.modulo_slug, m.nombre as modulo_nombre, o.identificador,
         o.importe_centavos::float8 as importe, o.estado, o.created_at,
         pg.created_at as pagada_en, ult.proveedor, ult.referencia_externa, c.numero as comprobante
    from pagos.ordenes_pago o
    join pagos.modulos m on m.slug = o.modulo_slug
    left join lateral (
      select proveedor, referencia_externa from pagos.pagos
       where orden_id = o.id order by created_at desc, id desc limit 1
    ) ult on true
    left join lateral (
      select created_at from pagos.pagos
       where orden_id = o.id and estado = 'pagado' order by created_at limit 1
    ) pg on true
    left join pagos.comprobantes c on c.orden_id = o.id`;

type FilaOrden = {
  id: string;
  modulo_slug: string;
  modulo_nombre: string;
  identificador: string | null;
  importe: number;
  estado: OrdenAdmin['estado'];
  created_at: Date;
  pagada_en: Date | null;
  proveedor: string | null;
  referencia_externa: string | null;
  comprobante: string | null;
};

function aOrden(f: FilaOrden): OrdenAdmin {
  return {
    id: Number(f.id),
    moduloSlug: f.modulo_slug,
    moduloNombre: f.modulo_nombre,
    identificador: f.identificador,
    importeCentavos: f.importe,
    estado: f.estado,
    creadaEn: f.created_at.toISOString(),
    pagadaEn: f.pagada_en?.toISOString() ?? null,
    proveedor: f.proveedor,
    referenciaExterna: f.referencia_externa,
    comprobante: f.comprobante,
  };
}

adminRouter.get('/resumen', async (req, res, next) => {
  try {
    const periodo = periodosAdmin.includes(req.query.periodo as PeriodoAdmin) ? (req.query.periodo as PeriodoAdmin) : '30d';
    const { desde, hasta, desdeAnterior, hastaAnterior } = rangoDe(periodo);
    const paso = periodo === 'anio' ? 'month' : 'day';

    const [totales, anterior, ordenes, serie, porTramite, ultimos] = await Promise.all([
      pool.query(
        `${PAGADOS}
         select coalesce(sum(importe), 0)::float8 as recaudado, count(*)::int as pagos
           from pagados where pagado_local::date between $1 and $2`,
        [desde, hasta],
      ),
      pool.query(
        `${PAGADOS}
         select coalesce(sum(importe), 0)::float8 as recaudado
           from pagados where pagado_local::date between $1 and $2`,
        [desdeAnterior, hastaAnterior],
      ),
      pool.query(
        `select count(*) filter (where estado = 'pendiente')::int as pendientes,
                count(*) filter (where estado = 'rechazada')::int as rechazadas
           from pagos.ordenes_pago
          where (created_at at time zone '${TZ}')::date between $1 and $2`,
        [desde, hasta],
      ),
      pool.query(
        `${PAGADOS}
         select to_char(g.fecha, 'YYYY-MM-DD') as fecha,
                coalesce(sum(p.importe), 0)::float8 as recaudado, count(p.id)::int as pagos
           from generate_series($1::timestamp, $2::timestamp, ('1 ' || $3)::interval) as g(fecha)
           left join pagados p on date_trunc($3, p.pagado_local) = date_trunc($3, g.fecha)
          group by g.fecha order by g.fecha`,
        [desde, hasta, paso],
      ),
      pool.query(
        `${PAGADOS}
         select m.slug, m.nombre, coalesce(sum(p.importe), 0)::float8 as recaudado, count(p.id)::int as pagos
           from pagos.modulos m
           left join pagados p on p.modulo_slug = m.slug and p.pagado_local::date between $1 and $2
          where m.activo
          group by m.slug, m.nombre order by recaudado desc, m.nombre`,
        [desde, hasta],
      ),
      pool.query<FilaOrden>(`${ORDEN_SELECT} where o.estado = 'pagada' order by pg.created_at desc nulls last limit 8`),
    ]);

    const recaudado = totales.rows[0].recaudado as number;
    const pagos = totales.rows[0].pagos as number;
    const body: ResumenAdmin = {
      periodo,
      desde,
      hasta,
      recaudadoCentavos: recaudado,
      recaudadoAnteriorCentavos: anterior.rows[0].recaudado,
      pagosConfirmados: pagos,
      ticketPromedioCentavos: pagos ? Math.round(recaudado / pagos) : 0,
      ordenesPendientes: ordenes.rows[0].pendientes,
      ordenesRechazadas: ordenes.rows[0].rechazadas,
      serie: serie.rows.map((r) => ({ fecha: r.fecha, recaudadoCentavos: r.recaudado, pagos: r.pagos })),
      porTramite: porTramite.rows.map((r) => ({ slug: r.slug, nombre: r.nombre, recaudadoCentavos: r.recaudado, pagos: r.pagos })),
      ultimosPagos: ultimos.rows.map(aOrden),
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/ordenes', async (req, res, next) => {
  try {
    const filtros: string[] = [];
    const params: unknown[] = [];
    const agregar = (sql: string, valor: unknown) => {
      params.push(valor);
      filtros.push(sql.replace('?', `$${params.length}`));
    };

    const { estado, modulo, q, desde, hasta } = req.query as Record<string, string | undefined>;
    if (estado) agregar('o.estado = ?', estado);
    if (modulo) agregar('o.modulo_slug = ?', modulo);
    if (desde) agregar(`(o.created_at at time zone '${TZ}')::date >= ?`, desde);
    if (hasta) agregar(`(o.created_at at time zone '${TZ}')::date <= ?`, hasta);
    if (q?.trim()) {
      // Busca por DNI/CUIT (solo dígitos), número de comprobante o número de orden.
      const texto = q.trim();
      params.push(`%${texto.replace(/\D/g, '') || texto}%`, `%${texto}%`, texto);
      const n = params.length;
      filtros.push(`(o.identificador like $${n - 2} or c.numero ilike $${n - 1} or o.id::text = $${n})`);
    }
    const where = filtros.length ? `where ${filtros.join(' and ')}` : '';
    const limite = Math.min(Number(req.query.limite) || 50, 200);
    const desplazamiento = Math.max(Number(req.query.desde_fila) || 0, 0);

    const [filas, total] = await Promise.all([
      pool.query<FilaOrden>(
        `${ORDEN_SELECT} ${where} order by o.created_at desc limit ${limite} offset ${desplazamiento}`,
        params,
      ),
      pool.query(
        `select count(*)::int as total from pagos.ordenes_pago o
           left join pagos.comprobantes c on c.orden_id = o.id ${where}`,
        params,
      ),
    ]);
    const body: OrdenesAdminResponse = { total: total.rows[0].total, filas: filas.rows.map(aOrden) };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/tramites', async (_req, res, next) => {
  try {
    const [modulos, tarifas] = await Promise.all([
      pool.query(
        `select m.slug, m.nombre, c.nombre as categoria, m.tipo, m.activo, m.config
           from pagos.modulos m
           join pagos.categorias c on c.slug = m.categoria_slug
          order by c.orden, m.orden, m.nombre`,
      ),
      pool.query(
        `select modulo_slug, concepto, valor, to_char(vigente_desde, 'YYYY-MM-DD') as vigente_desde, creado_por,
                vigente_desde <= (now() at time zone '${TZ}')::date as rige
           from pagos.tarifas
          order by vigente_desde desc, id desc`,
      ),
    ]);

    const body: TramiteAdmin[] = modulos.rows.map((m) => {
      const config = m.config as Partial<ConfigModulo>;
      const requeridos = conceptosDeMonto(config.monto);
      const propias = tarifas.rows.filter((t) => t.modulo_slug === m.slug);
      // Los que pide el cálculo primero; después los que solo existen como tarifa cargada.
      const conceptos = [...new Set([...requeridos, ...propias.map((t) => t.concepto as string)])];

      return {
        slug: m.slug,
        nombre: m.nombre,
        categoria: m.categoria,
        tipo: m.tipo,
        activo: m.activo,
        requisito: config.requisito?.tipo ?? 'sin_configurar',
        campos: (config.campos ?? []).map((c) => c.label),
        conceptos: conceptos.map((concepto) => {
          const versiones = propias.filter((t) => t.concepto === concepto);
          const aVersion = (t: (typeof versiones)[number]): TarifaVersionAdmin => ({
            valor: t.valor,
            vigenteDesde: t.vigente_desde,
            creadoPor: t.creado_por,
          });
          const vigente = versiones.find((t) => t.rige);
          // versiones viene de la más nueva a la más vieja: la próxima es la futura más cercana.
          const proxima = versiones.filter((t) => !t.rige).at(-1);
          return {
            concepto,
            requerido: requeridos.includes(concepto),
            vigente: vigente ? aVersion(vigente) : null,
            proxima: proxima ? aVersion(proxima) : null,
            historial: versiones.map(aVersion),
          };
        }),
      };
    });
    res.json(body);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/auditoria', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `select id, actor, accion, entidad, entidad_id, created_at
         from pagos.auditoria order by created_at desc, id desc limit 100`,
    );
    const body: AuditoriaAdmin[] = result.rows.map((r) => ({
      id: Number(r.id),
      actor: r.actor,
      accion: r.accion,
      entidad: r.entidad,
      entidadId: r.entidad_id,
      creadaEn: r.created_at.toISOString(),
    }));
    res.json(body);
  } catch (error) {
    next(error);
  }
});

/**
 * Cargar un valor nuevo de tarifa (Recaudaciones, panel financiero). Las tarifas son versionadas: se
 * agrega una versión con su fecha de vigencia, nunca se pisa lo anterior ni se cambia el pasado.
 * Solo importes fijos (en pesos, se guardan en centavos); las escalas se cargan por migración.
 * Queda en la auditoría con el valor anterior. Como todo `/api/admin`, no responde hasta que haya login.
 */
adminRouter.post('/tarifas', async (req, res, next) => {
  try {
    const moduloSlug = String(req.body?.moduloSlug ?? '');
    const concepto = String(req.body?.concepto ?? '');
    const vigenteDesde = String(req.body?.vigenteDesde ?? '');
    const pesosIngresados = Number(req.body?.importePesos);
    if (!/^[a-z0-9-]{1,80}$/.test(moduloSlug) || !/^[a-z0-9-]{1,80}$/.test(concepto)) {
      res.status(400).json({ error: 'Trámite o concepto inválido.' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde) || vigenteDesde < hoyAr()) {
      res.status(400).json({ error: 'La fecha de vigencia no puede ser anterior a hoy.' });
      return;
    }
    if (!Number.isFinite(pesosIngresados) || pesosIngresados <= 0 || pesosIngresados > 100_000_000) {
      res.status(400).json({ error: 'El importe tiene que ser mayor a cero.' });
      return;
    }
    const centavos = Math.round(pesosIngresados * 100);
    const modulo = await pool.query<{ config: Partial<ConfigModulo> }>('select config from pagos.modulos where slug = $1', [moduloSlug]);
    if (!modulo.rows[0]) {
      res.status(404).json({ error: 'El trámite no existe.' });
      return;
    }
    const previa = await pool.query<{ valor: unknown }>(
      `select valor from pagos.tarifas where modulo_slug = $1 and concepto = $2 and vigente_desde <= $3::date
        order by vigente_desde desc, id desc limit 1`,
      [moduloSlug, concepto, vigenteDesde],
    );
    if (previa.rows[0] && typeof previa.rows[0].valor !== 'number') {
      res.status(409).json({ error: 'Esta tarifa es una escala por tramos: se cambia con una migración.' });
      return;
    }
    if (!previa.rows[0] && !conceptosDeMonto(modulo.rows[0].config.monto).includes(concepto)) {
      res.status(404).json({ error: 'Ese concepto no existe en el trámite.' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into pagos.tarifas (modulo_slug, concepto, valor, vigente_desde, creado_por)
         values ($1, $2, $3::jsonb, $4::date, 'panel-financiero')`,
        [moduloSlug, concepto, JSON.stringify(centavos), vigenteDesde],
      );
      await client.query(
        "insert into pagos.auditoria (actor, accion, entidad, entidad_id, antes, despues) values ('panel-financiero', 'tarifa', 'tarifa', $1, $2, $3)",
        [`${moduloSlug}/${concepto}`, { centavos: previa.rows[0]?.valor ?? null }, { centavos, vigenteDesde }],
      );
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      if ((e as { code?: string }).code === '23505') {
        // Nunca se pisa una versión anterior: para cambiarla se carga otra con fecha distinta.
        res.status(409).json({ error: 'Ya hay un valor cargado para esa fecha de vigencia. Elegí otra fecha.' });
        return;
      }
      throw e;
    } finally {
      client.release();
    }
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
