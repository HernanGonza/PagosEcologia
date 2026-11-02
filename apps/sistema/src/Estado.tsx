import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from './sesion';

interface Estado {
  ahora: string;
  nodo: string;
  baseMs: number;
  baseBytes: number;
  migraciones: { enRepo: number; aplicadas: number; ultima: string | null; faltan: string[] };
  ordenesPendientes: number;
  codigosUltimas24h: number;
  entorno: { produccion: boolean; proveedorPago: string; correo: string; almacenamiento: string; loginLocal: boolean; emisionSimulada: boolean; webUrl: boolean; trustProxy: boolean };
  alertas: string[];
}

const si = (v: boolean) => (v ? 'Sí' : 'No');
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

function Fila({ k, v, mal }: { k: string; v: string; mal?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={`text-right font-medium ${mal ? 'text-destructive' : ''}`}>{v}</span>
    </div>
  );
}

export default function Estado() {
  const [e, setE] = useState<Estado | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => api<Estado>('/sistema/estado').then((d) => (setE(d), setError('')), (x) => setError((x as Error).message)), []);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  if (!e) return error ? <p role="alert" className="text-destructive">{error}</p> : <p className="text-muted-foreground">Cargando…</p>;
  const caja = 'rounded-2xl border border-border bg-white p-5';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-verde-800">Estado del sistema</h1>
          <p className="mt-1 text-sm text-muted-foreground">Se actualiza solo cada 30 segundos. Solo muestra si cada cosa está configurada, nunca claves.</p>
        </div>
        <button type="button" onClick={cargar} className="rounded-full border border-border p-2 hover:bg-crema-200" aria-label="Actualizar" title="Actualizar"><RefreshCw className="size-4" /></button>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {e.alertas.length ? (
        <ul className="flex flex-col gap-2">
          {e.alertas.map((a) => <li key={a} className="rounded-lg bg-destructive/8 px-4 py-3 text-sm text-destructive">{a}</li>)}
        </ul>
      ) : (
        <p className="rounded-lg bg-sage-200 px-4 py-3 text-sm text-verde-800">Todo en orden: sin alertas.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <section className={caja}>
          <h2 className="mb-2 font-medium">Base de datos y migraciones</h2>
          <Fila k="Respuesta de la base" v={`${e.baseMs} ms`} mal={e.baseMs > 1000} />
          <Fila k="Tamaño de la base" v={mb(e.baseBytes)} />
          <Fila k="Migraciones aplicadas" v={`${e.migraciones.aplicadas} de ${e.migraciones.enRepo}`} mal={e.migraciones.faltan.length > 0} />
          <Fila k="Última migración" v={e.migraciones.ultima ?? '—'} />
        </section>
        <section className={caja}>
          <h2 className="mb-2 font-medium">Actividad</h2>
          <Fila k="Órdenes de pago pendientes" v={String(e.ordenesPendientes)} />
          <Fila k="Códigos de verificación (24 h)" v={String(e.codigosUltimas24h)} />
          <Fila k="Hora del servidor" v={new Date(e.ahora).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} />
          <Fila k="Node" v={e.nodo} />
        </section>
        <section className={`${caja} md:col-span-2`}>
          <h2 className="mb-2 font-medium">Configuración</h2>
          <Fila k="Entorno" v={e.entorno.produccion ? 'Producción' : 'Desarrollo'} />
          <Fila k="Proveedor de pago" v={e.entorno.proveedorPago} mal={e.entorno.produccion && e.entorno.proveedorPago !== 'macroclick'} />
          <Fila k="Correo" v={e.entorno.correo} mal={e.entorno.correo !== 'configurado'} />
          <Fila k="Archivos (documentos y certificados)" v={e.entorno.almacenamiento} mal={e.entorno.almacenamiento === 'sin configurar'} />
          <Fila k="WEB_URL definida" v={si(e.entorno.webUrl)} />
          <Fila k="TRUST_PROXY definido" v={si(e.entorno.trustProxy)} />
          <Fila k="Login local (sin Ecodatos)" v={si(e.entorno.loginLocal)} mal={e.entorno.produccion && e.entorno.loginLocal} />
          <Fila k="Emisión simulada de certificados" v={si(e.entorno.emisionSimulada)} mal={e.entorno.produccion && e.entorno.emisionSimulada} />
        </section>
      </div>
    </div>
  );
}
