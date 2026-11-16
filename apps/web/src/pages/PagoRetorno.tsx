// A donde vuelve el contribuyente desde el checkout del banco. NO confirma nada: solo muestra el estado
// que tiene nuestra base (la confirmación la hace el aviso del banco, reconfirmado con el banco).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Marco from '../components/Marco';

type Estado = 'consultando' | 'pendiente' | 'pagada' | 'rechazada' | 'desconocida';
const API = import.meta.env.VITE_API_BASE ?? '/api';
const INTENTOS = 20; // cada 3 s: hasta un minuto esperando que el banco confirme

export default function PagoRetorno() {
  const [q] = useSearchParams();
  const ref = q.get('ref') ?? '';
  const cancelado = q.get('r') === 'cancelado';
  const [estado, setEstado] = useState<Estado>('consultando');

  useEffect(() => {
    const anterior = document.title;
    document.title = 'Estado del pago · Pagos y trámites';
    return () => {
      document.title = anterior;
    };
  }, []);

  useEffect(() => {
    if (!ref) return setEstado('desconocida');
    let vivo = true;
    let n = 0;
    async function consultar() {
      try {
        const r = await fetch(`${API}/pagos/orden/${encodeURIComponent(ref)}/estado`);
        if (!vivo) return;
        if (r.status === 404) return setEstado('desconocida');
        const { estado: e } = (await r.json()) as { estado: string };
        if (e === 'pagada') return setEstado('pagada');
        if (e === 'rechazada' || e === 'anulada' || e === 'vencida') return setEstado('rechazada');
        setEstado('pendiente');
      } catch {
        setEstado('pendiente');
      }
      if (vivo && ++n < INTENTOS) setTimeout(consultar, 3000);
    }
    consultar();
    return () => {
      vivo = false;
    };
  }, [ref]);

  const ver = (() => {
    if (estado === 'pagada') return { Icono: CircleCheck, titulo: 'Recibimos tu pago', texto: 'Tu pago fue confirmado. Te enviamos un mail con el certificado; también podés descargarlo entrando con tu mail a "Mis certificados" del trámite.' };
    if (estado === 'rechazada' || (cancelado && estado !== 'consultando' && estado !== 'pendiente')) return { Icono: CircleAlert, titulo: 'El pago no se completó', texto: 'No se realizó ningún cobro. Podés volver a intentarlo entrando a tu solicitud con tu mail.' };
    if (estado === 'desconocida') return { Icono: CircleAlert, titulo: 'No encontramos ese pago', texto: 'Revisá el enlace o entrá a tu solicitud con tu mail para ver cómo quedó.' };
    return {
      Icono: Clock,
      titulo: cancelado ? 'Cancelaste el pago' : 'Estamos confirmando tu pago',
      texto: cancelado
        ? 'Si no completaste el pago, no se hizo ningún cobro. Podés volver a intentarlo entrando a tu solicitud con tu mail.'
        : 'El banco nos tiene que confirmar el pago. Puede demorar unos minutos: no hace falta que hagas nada más. Cuando se confirme te llega un mail y lo ves en tu solicitud.',
    };
  })();

  return (
    <Marco>
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center sm:py-24">
        <span className="flex size-16 items-center justify-center rounded-full bg-crema-200 text-verde-700">
          <ver.Icono className="size-8" aria-hidden="true" />
        </span>
        <h1 role="status" className="mt-6 text-3xl leading-tight font-medium tracking-tight text-verde-800 sm:text-4xl">{ver.titulo}</h1>
        <p className="mt-4 text-muted-foreground">{ver.texto}</p>
        <Button asChild className="mt-8 rounded-lg">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </main>
    </Marco>
  );
}
