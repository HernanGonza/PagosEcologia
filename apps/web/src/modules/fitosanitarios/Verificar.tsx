// Página pública que abre el QR del certificado: dice si es auténtico y en qué estado está hoy.
// Datos mínimos (sin DNI, domicilio ni contacto del titular).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CircleCheck, CircleX, Clock, Loader2 } from 'lucide-react';
import type { VerificacionPublica } from '@botonera/shared';
import { cn } from '@/lib/utils';
import Marco from '../../components/Marco';
import { ErrorApi, fecha, verificar } from './api';
import { Kicker } from './comunes';

const estados: Record<VerificacionPublica['estado'], { titulo: string; clase: string; icono: typeof CircleCheck }> = {
  vigente: { titulo: 'Certificado vigente', clase: 'bg-ok/12 text-ok', icono: CircleCheck },
  por_comenzar: { titulo: 'Certificado todavía no vigente', clase: 'bg-aviso/12 text-aviso', icono: Clock },
  vencido: { titulo: 'Certificado vencido', clase: 'bg-destructive/10 text-destructive', icono: CircleX },
  revocado: { titulo: 'Certificado revocado', clase: 'bg-destructive/10 text-destructive', icono: CircleX },
};

export default function Verificar() {
  const { codigo = '' } = useParams();
  const [v, setV] = useState<VerificacionPublica | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    verificar(codigo).then(setV, (e) => setError(e instanceof ErrorApi && e.status === 404 ? 'No encontramos un certificado con este código.' : (e as Error).message));
  }, [codigo]);

  const e = v ? estados[v.estado] : null;
  return (
    <Marco>
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <Kicker>Verificación de certificado</Kicker>
        <h1 className="mt-2 mb-6 text-3xl font-medium tracking-tight text-verde-800">Fitosanitarios y domisanitarios</h1>
        {!v && !error && <Loader2 className="size-6 animate-spin text-verde-600" />}
        {error && (
          <div role="alert" className="rounded-2xl bg-destructive/8 p-5 text-destructive">
            <p className="flex items-center gap-2 font-medium"><CircleX className="size-5" /> {error}</p>
            <p className="mt-1 text-sm">Si el código viene de un papel, el certificado puede no ser auténtico.</p>
          </div>
        )}
        {v && e && (
          <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <p className={cn('flex items-center gap-3 rounded-xl px-4 py-3 text-lg font-medium', e.clase)}>
              <e.icono className="size-6" /> {e.titulo}
            </p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ['Número', v.numero],
                ['Titular', v.titular],
                ['Tipo', v.tipoNombre],
                [v.tipoNombre?.toLowerCase().startsWith('veh') ? 'Patente' : 'Objeto', v.etiqueta],
                ['Vigente desde', fecha(v.vigenteDesde)],
                ['Vence el', fecha(v.venceEn)],
                ['VTV vence el', v.vtvVenceEn ? fecha(v.vtvVenceEn) : null],
              ].filter(([, val]) => val).map(([k, val]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-medium break-words">{val}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-xs text-muted-foreground">El estado se calcula al momento de la consulta.</p>
          </div>
        )}
      </main>
    </Marco>
  );
}
