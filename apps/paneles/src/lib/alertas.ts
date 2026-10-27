/**
 * Confirmaciones y avisos del panel (SweetAlert2) con los estilos de la marca. Todas las
 * acciones que cambian una solicitud o le mandan un mail a la persona pasan por `confirmar`.
 */
import Swal, { type SweetAlertIcon } from 'sweetalert2';

const boton = 'inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3';

const confirmarVerde = `${boton} bg-verde-600 text-white hover:bg-verde-700 focus-visible:ring-verde-600/30`;
const confirmarRojo = `${boton} bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30`;

// SweetAlert no combina customClass: el de cada llamada reemplaza al del mixin. Por eso se arma completo.
const clases = (confirmButton = confirmarVerde) => ({
  popup: 'rounded-3xl! px-6! pt-6! pb-5! font-sans',
  icon: 'mt-1! mb-3! scale-75',
  title: 'text-xl! font-medium! text-verde-800! p-0!',
  htmlContainer: 'text-sm! text-muted-foreground! m-0! mt-2! px-2! leading-relaxed!',
  actions: 'gap-2! mt-6! mb-0!',
  confirmButton,
  cancelButton: `${boton} border border-border bg-white text-foreground hover:bg-crema`,
});

const base = Swal.mixin({ buttonsStyling: false, reverseButtons: true, customClass: clases() });

interface Confirmacion {
  titulo: string;
  texto: string;
  boton: string;
  /** Rojo, para acciones que no tienen vuelta atrás (rechazar). */
  peligro?: boolean;
  icono?: SweetAlertIcon;
}

/** Pregunta antes de actuar. Devuelve true si la persona confirma. */
export async function confirmar({ titulo, texto, boton: textoBoton, peligro, icono = 'question' }: Confirmacion): Promise<boolean> {
  const r = await base.fire({
    title: titulo,
    text: texto,
    icon: peligro ? 'warning' : icono,
    iconColor: peligro ? 'var(--destructive)' : 'var(--verde-600)',
    showCancelButton: true,
    confirmButtonText: textoBoton,
    cancelButtonText: 'Cancelar',
    focusCancel: !!peligro,
    customClass: clases(peligro ? confirmarRojo : confirmarVerde),
  });
  return r.isConfirmed;
}

const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  customClass: { popup: 'rounded-2xl! font-sans text-sm!', title: 'text-sm! font-medium! text-foreground!' },
});

export const avisoExito = (titulo: string) => toast.fire({ icon: 'success', iconColor: 'var(--verde-600)', title: titulo });

export const avisoError = (titulo: string, texto?: string) =>
  base.fire({ icon: 'error', iconColor: 'var(--destructive)', title: titulo, text: texto, confirmButtonText: 'Entendido' });

/** Mientras se procesa una acción (por ejemplo, mientras sale el mail). Lo reemplaza el aviso siguiente. */
export const cargando = (titulo: string) => {
  void base.fire({ title: titulo, allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
};
