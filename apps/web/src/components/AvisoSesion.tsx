import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Aviso de sesión por vencer. Los módulos (api.ts) emiten `sesion-segundos` con cada respuesta que trae la cabecera
 * `X-Sesion-Segundos` (cuánto le queda a la sesión). Dos minutos antes se muestra el aviso con "Seguir conectado",
 * que le pide a la API renovar la sesión; si ya llegó al máximo total, avisa que no se puede extender.
 * Si la sesión ya se cerró, lo dice y lleva a la página donde se pide un enlace nuevo. Sin cuenta regresiva visible.
 */
const AVISAR_ANTES_S = 120;

type Datos = { segundos: number; base: string };

export default function AvisoSesion() {
  const [vence, setVence] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [alLimite, setAlLimite] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const base = useRef('');

  useEffect(() => {
    const alRecibir = (e: Event) => {
      const d = (e as CustomEvent<Datos>).detail;
      if (!d || !Number.isFinite(d.segundos)) return;
      base.current = d.base;
      setVence(Date.now() + d.segundos * 1000);
      setAlLimite(false);
    };
    window.addEventListener('sesion-segundos', alRecibir);
    return () => window.removeEventListener('sesion-segundos', alRecibir);
  }, []);

  // Reloj interno (no se muestra): solo decide cuándo aparece el aviso. Se calcula con la hora real, así
  // que sigue bien si la computadora estuvo suspendida.
  useEffect(() => {
    if (vence === null) return;
    const t = setInterval(() => setAhora(Date.now()), 5000);
    const alVolver = () => document.visibilityState === 'visible' && setAhora(Date.now());
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [vence]);

  const modulo = base.current.split('/').filter(Boolean).pop() ?? '';
  const irAIngresar = () => window.location.assign(`${import.meta.env.BASE_URL}pagar/${modulo}?enlace=vencido`);

  async function seguirConectado() {
    setOcupado(true);
    try {
      const r = await fetch(`${base.current}/sesion/estado`, { credentials: 'same-origin' });
      if (r.status === 401) return irAIngresar();
      const { segundos } = (await r.json()) as { segundos: number };
      setVence(Date.now() + segundos * 1000);
      setAhora(Date.now());
      // Si después de renovar sigue por vencer, es que llegó al máximo total: no se puede extender más.
      setAlLimite(segundos <= AVISAR_ANTES_S);
    } catch {
      /* sin conexión: el aviso queda y se puede reintentar */
    }
    setOcupado(false);
  }

  if (vence === null) return null;
  const restante = (vence - ahora) / 1000;
  if (restante > AVISAR_ANTES_S) return null;
  const cerrada = restante <= 0;

  return (
    <div role="alert" className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-xl print:hidden">
      <div className="flex flex-col gap-3 rounded-xl border border-amarillo-400 bg-white p-4 text-sm shadow-lg sm:flex-row sm:items-center">
        <Clock className="hidden size-5 shrink-0 text-verde-700 sm:block" aria-hidden="true" />
        <p className="flex-1 text-foreground">
          {cerrada
            ? 'Tu sesión se cerró. Lo que ya guardaste sigue ahí: para continuar, ingresá de nuevo con tu mail.'
            : alLimite
              ? 'Tu sesión llegó al máximo de duración y se cierra en unos minutos. Guardá lo que estés cargando; después podés volver a entrar con tu mail.'
              : 'Tu sesión se cierra en menos de 2 minutos por inactividad. ¿Querés seguir conectado?'}
        </p>
        {cerrada ? (
          <Button className="rounded-lg" onClick={irAIngresar}>
            Ingresar de nuevo
          </Button>
        ) : (
          !alLimite && (
            <Button className="rounded-lg" onClick={seguirConectado} disabled={ocupado}>
              Seguir conectado
            </Button>
          )
        )}
      </div>
    </div>
  );
}
