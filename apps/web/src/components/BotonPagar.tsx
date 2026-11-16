import { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enviarFormulario, type FormularioPago } from '../lib/enviar-formulario';

/**
 * "Pagar la tasa": le pide a la API (de cada módulo) que cree la orden y devuelva el formulario del banco, y manda
 * al contribuyente a su checkout. El monto lo fija el servidor: acá no se manda ningún importe.
 */
export default function BotonPagar({ iniciar, texto = 'Pagar la tasa' }: { iniciar: () => Promise<{ referencia: string; formulario?: FormularioPago }>; texto?: string }) {
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState('');

  // Si vuelve con "Atrás" desde el banco, la página puede quedar en memoria con el botón trabado.
  useEffect(() => {
    const alVolver = (e: PageTransitionEvent) => e.persisted && setYendo(false);
    window.addEventListener('pageshow', alVolver);
    return () => window.removeEventListener('pageshow', alVolver);
  }, []);

  async function pagar() {
    setYendo(true);
    setError('');
    try {
      const r = await iniciar();
      if (!r.formulario) throw new Error('El pago en línea no está disponible en este momento. Intentá más tarde.');
      enviarFormulario(r.formulario);
    } catch (e) {
      setError((e as Error).message);
      setYendo(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="lg" className="rounded-lg" disabled={yendo} onClick={pagar}>
        {yendo ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} {texto}
      </Button>
      <p className="text-sm text-muted-foreground">Te llevamos a la página de pago del banco (Click de Pago). Al terminar volvés acá.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
