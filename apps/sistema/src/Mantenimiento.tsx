import { useEffect, useState, type FormEvent } from 'react';
import { confirmar } from '@/lib/alertas';
import { api } from './sesion';

interface Config {
  mantenimiento: { activo: boolean; mensaje: string };
  aviso: { activo: boolean; texto: string; nivel: 'info' | 'alerta' };
}

const caja = 'rounded-2xl border border-border bg-white p-6';
const campo = 'w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus:border-rosa-600 focus:ring-3 focus:ring-rosa-600/20 focus:outline-none';
const boton = 'rounded-full bg-verde-600 px-5 py-2 text-sm font-medium text-white hover:bg-verde-700 disabled:opacity-60';

export default function Mantenimiento() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [texto, setTexto] = useState('');
  const [nivel, setNivel] = useState<'info' | 'alerta'>('info');
  const [guardando, setGuardando] = useState(false);

  function aplicar(c: Config) {
    setConfig(c);
    setMensaje(c.mantenimiento.mensaje);
    setTexto(c.aviso.texto);
    setNivel(c.aviso.nivel);
  }
  useEffect(() => {
    api<Config>('/sistema/config').then(aplicar, (e) => setError((e as Error).message));
  }, []);

  async function guardar(ruta: 'mantenimiento' | 'aviso', cuerpo: object, aviso: string) {
    setGuardando(true);
    setError('');
    setOk('');
    try {
      await api(`/sistema/config/${ruta}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
      aplicar(await api<Config>('/sistema/config'));
      setOk(aviso);
    } catch (e) {
      setError((e as Error).message);
    }
    setGuardando(false);
  }

  async function cambiarMantenimiento(activo: boolean) {
    if (activo && !(await confirmar({
      titulo: '¿Activar el modo mantenimiento?',
      texto: 'Toda la página pública deja de funcionar: nadie puede iniciar ni seguir un trámite. Los paneles de los técnicos y la verificación por QR siguen andando.',
      boton: 'Activar',
      icono: 'warning',
    }))) return;
    await guardar('mantenimiento', { activo, mensaje }, activo ? 'Mantenimiento activado.' : 'Mantenimiento desactivado: la página vuelve a funcionar.');
  }

  if (!config) return error ? <p role="alert" className="text-destructive">{error}</p> : <p className="text-muted-foreground">Cargando…</p>;
  const { mantenimiento, aviso } = config;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-medium text-verde-800">Mantenimiento y avisos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Los cambios se ven en la página pública en unos 10 segundos, sin que nadie recargue. Todo queda en la auditoría.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p>}
      {ok && <p role="status" className="rounded-lg bg-sage-200 px-4 py-3 text-sm text-verde-800">{ok}</p>}

      <section className={caja}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Modo mantenimiento</h2>
            <p className="mt-1 text-sm text-muted-foreground">Corta toda la página pública y sus APIs. Sirve para migraciones o cambios grandes.</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${mantenimiento.activo ? 'bg-destructive/10 text-destructive' : 'bg-sage-200 text-verde-800'}`}>
            {mantenimiento.activo ? 'ACTIVO' : 'Apagado'}
          </span>
        </div>
        <label className="mt-4 block text-sm font-medium">Mensaje para el público (opcional)
          <textarea className={`${campo} mt-1`} rows={2} maxLength={300} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej.: Volvemos a las 18 h. Disculpá las molestias." />
        </label>
        <div className="mt-4 flex gap-3">
          {mantenimiento.activo ? (
            <>
              <button type="button" className={boton} disabled={guardando} onClick={() => cambiarMantenimiento(false)}>Desactivar y reabrir la página</button>
              <button type="button" className="rounded-full border border-border px-5 py-2 text-sm" disabled={guardando} onClick={() => guardar('mantenimiento', { activo: true, mensaje }, 'Mensaje actualizado.')}>Guardar mensaje</button>
            </>
          ) : (
            <button type="button" className="rounded-full bg-destructive px-5 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={guardando} onClick={() => cambiarMantenimiento(true)}>Activar mantenimiento</button>
          )}
        </div>
      </section>

      <form
        className={caja}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          guardar('aviso', { activo: true, texto, nivel }, 'Aviso publicado.');
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Aviso en la página pública</h2>
            <p className="mt-1 text-sm text-muted-foreground">Una franja arriba de todas las pantallas. Sirve para avisar de demoras, cortes programados o cambios.</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${aviso.activo ? 'bg-sage-200 text-verde-800' : 'bg-muted text-muted-foreground'}`}>{aviso.activo ? 'Publicado' : 'Sin aviso'}</span>
        </div>
        <label className="mt-4 block text-sm font-medium">Texto
          <textarea className={`${campo} mt-1`} rows={2} maxLength={300} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: El sábado de 8 a 12 h el sistema no estará disponible." />
        </label>
        <fieldset className="mt-3 flex gap-5 text-sm">
          <legend className="sr-only">Tipo de aviso</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={nivel === 'info'} onChange={() => setNivel('info')} /> Informativo</label>
          <label className="flex items-center gap-2"><input type="radio" checked={nivel === 'alerta'} onChange={() => setNivel('alerta')} /> Alerta</label>
        </fieldset>
        {texto.trim() && (
          <div className={`mt-4 rounded-lg px-4 py-2.5 text-sm ${nivel === 'alerta' ? 'bg-amarillo-400/30' : 'bg-sage-200 text-verde-800'}`}><span className="mr-2 text-xs uppercase opacity-60">Vista previa</span>{texto}</div>
        )}
        <div className="mt-4 flex gap-3">
          <button type="submit" className={boton} disabled={guardando || !texto.trim()}>{aviso.activo ? 'Actualizar aviso' : 'Publicar aviso'}</button>
          {aviso.activo && (
            <button type="button" className="rounded-full border border-border px-5 py-2 text-sm" disabled={guardando} onClick={() => guardar('aviso', { activo: false, texto, nivel }, 'Aviso retirado.')}>Retirar aviso</button>
          )}
        </div>
      </form>
    </div>
  );
}
