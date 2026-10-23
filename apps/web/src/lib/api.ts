import type { CatalogoResponse } from '@botonera/shared';
import { catalogoMock } from '../mock/catalogo';

// Mientras no haya base ni API real, el catálogo sale del mock.
const USAR_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

export async function getCatalogo(): Promise<CatalogoResponse> {
  if (USAR_MOCK) {
    await new Promise((r) => setTimeout(r, 250));
    return catalogoMock;
  }
  const res = await fetch('/api/modulos');
  if (!res.ok) throw new Error('No se pudo cargar el catálogo');
  return res.json();
}
