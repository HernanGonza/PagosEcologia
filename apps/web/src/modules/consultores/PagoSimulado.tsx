// Pago SIMULADO (demostración): solo existe cuando la API corre con EMISION_SIMULADA=1 y el front se compiló con
// VITE_PAGO_SIMULADO=1. Hace de checkout de la pasarela para mostrar el circuito completo hasta el certificado.
import { useState } from 'react';
import { Download, Loader2, CreditCard } from 'lucide-react';
import type { SolicitudPublica } from '@botonera/shared';
import { Button } from '@/components/ui/button';
import { api } from './api';

export const pagoSimuladoHabilitado = import.meta.env.VITE_PAGO_SIMULADO === '1';

export function BotonPagoSimulado({ onPagada }: { onPagada: (s: SolicitudPublica) => void }) {
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState('');
  async function pagar() {
    setPagando(true);
    setError('');
    try {
      await api.pagarSimulado();
      onPagada(await api.solicitud());
    } catch (e) {
      setError((e as Error).message);
      setPagando(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="lg" className="rounded-lg" disabled={pagando} onClick={pagar}>
        {pagando ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} Pagar la tasa (simulado)
      </Button>
      <p className="text-sm text-muted-foreground">Pago de demostración: no se cobra nada. Con la pasarela real, acá se abre el checkout del banco.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function BotonCertificado() {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState('');
  async function abrir() {
    setAbriendo(true);
    setError('');
    try {
      await api.abrirCertificado();
    } catch (e) {
      setError((e as Error).message);
    }
    setAbriendo(false);
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="lg" className="rounded-lg" disabled={abriendo} onClick={abrir}>
        {abriendo ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Ver el certificado (PDF)
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
