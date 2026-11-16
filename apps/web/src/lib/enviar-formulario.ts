/** Formulario que arma la API para el checkout del banco: a dónde se envía y los campos (ya cifrados y firmados). */
export interface FormularioPago {
  action: string;
  campos: Record<string, string>;
}

/**
 * Redirección completa al checkout del banco: arma un formulario oculto y lo envía con POST desde el navegador del
 * contribuyente (el banco lo exige así). La página actual se reemplaza por la del banco.
 */
export function enviarFormulario(f: FormularioPago) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = f.action;
  form.style.display = 'none';
  for (const [nombre, valor] of Object.entries(f.campos)) {
    const campo = document.createElement('input');
    campo.type = 'hidden';
    campo.name = nombre;
    campo.value = valor;
    form.appendChild(campo);
  }
  document.body.appendChild(form);
  form.submit();
}
