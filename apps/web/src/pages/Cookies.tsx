// Página informativa: qué cookie usa el sitio, para qué y cuánto dura la sesión.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Marco from '../components/Marco';

export default function Cookies() {
  useEffect(() => {
    const anterior = document.title;
    document.title = 'Cookies y sesión · Pagos y trámites';
    return () => {
      document.title = anterior;
    };
  }, []);

  return (
    <Marco>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl leading-tight font-medium tracking-tight text-verde-800 sm:text-4xl">Cookies y sesión</h1>
        <p className="mt-4 text-muted-foreground">
          Este sitio usa una única cookie técnica por trámite, necesaria para que el sistema reconozca que sos la misma persona entre una
          pantalla y la siguiente. Sin ella no se podría completar el trámite.
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-medium text-verde-800">Qué cookie es y para qué sirve</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              Es una cookie de <strong className="font-medium text-foreground">sesión</strong>: guarda un código al azar que identifica tu
              sesión en el sistema, nunca tus datos personales ni tus documentos.
            </li>
            <li>El código de la página (JavaScript) no puede leerla (es <em>HttpOnly</em>) y no viaja en pedidos que vienen de otros sitios (<em>SameSite=Strict</em>).</li>
            <li>
              No usamos cookies de seguimiento, de publicidad ni de análisis, y la página no carga recursos de terceros. Tampoco guardamos
              nada sobre lo que mirás en otros sitios.
            </li>
            <li>
              En tu navegador guardamos además una marca para no volver a mostrarte el aviso de cookies (la llave{' '}
              <code className="rounded bg-crema-200 px-1">aviso-cookies-visto</code>); no se envía al servidor.
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-medium text-verde-800">Cuánto dura la sesión</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Se cierra sola después de unos <strong className="font-medium text-foreground">30 minutos sin actividad</strong>.</li>
            <li>Y como máximo a las <strong className="font-medium text-foreground">4 horas</strong> de haber entrado, aunque estés usándola.</li>
            <li>Un par de minutos antes de que se cierre por inactividad te avisamos, y podés tocar «Seguir conectado».</li>
            <li>
              <strong className="font-medium text-foreground">Lo que ya guardaste no se pierde</strong>: la solicitud y los documentos
              quedan en el sistema. Solo se cierra tu acceso.
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-medium text-verde-800">Cómo volver a entrar</h2>
          <p className="mt-3 text-muted-foreground">
            Elegí el trámite, ingresá tu mail y te mandamos un código y, con él, un enlace nuevo a tus solicitudes. El enlace se usa una sola
            vez y reemplaza a los anteriores. Para cerrar tu sesión antes, usá el botón «Salir» de «Mis certificados» o borrá las cookies de este sitio
            desde la configuración de tu navegador.
          </p>
        </section>

        <p className="mt-10">
          <Link to="/" className="font-medium text-verde-700 underline underline-offset-2">
            Volver al inicio
          </Link>
        </p>
      </main>
    </Marco>
  );
}
