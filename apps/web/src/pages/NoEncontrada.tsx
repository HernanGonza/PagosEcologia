// Página 404 de la botonera pública: cualquier dirección que no existe cae acá (en vez de quedar en blanco).
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Marco from '../components/Marco';

export default function NoEncontrada() {
  useEffect(() => {
    const anterior = document.title;
    document.title = 'Página no encontrada · Pagos y trámites';
    return () => {
      document.title = anterior;
    };
  }, []);

  return (
    <Marco>
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center sm:py-24">
        <span className="flex size-16 items-center justify-center rounded-full bg-crema-200 text-verde-700">
          <Compass className="size-8" aria-hidden="true" />
        </span>
        <span className="mt-6 text-xs font-semibold tracking-[0.1em] text-rosa-600 uppercase">Error 404</span>
        <h1 className="mt-2 text-3xl leading-tight font-medium tracking-tight text-verde-800 sm:text-4xl">No encontramos esta página</h1>
        <p className="mt-4 text-muted-foreground">
          La dirección puede estar mal escrita o la página ya no existe. Volvé al inicio para elegir el trámite que necesitás.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          ¿Llegaste desde el enlace de un mail? Los enlaces se usan una sola vez y duran un tiempo limitado: si ya no funciona, entrá al
          trámite y pedí uno nuevo con tu mail.
        </p>
        <Button asChild size="lg" className="mt-8 rounded-lg">
          <Link to="/">
            Ir al inicio <ArrowRight className="size-4" />
          </Link>
        </Button>
      </main>
    </Marco>
  );
}
