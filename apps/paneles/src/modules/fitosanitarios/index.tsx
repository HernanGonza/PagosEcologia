import { Route, Routes } from 'react-router-dom';
import Detalle from './Detalle';
import Lista from './Lista';
import Titulares from './Titulares';
import FichaTitular from './FichaTitular';

/** Panel de Fitosanitarios: los técnicos revisan las solicitudes antes del pago. */
export default function PanelFitosanitarios() {
  return (
    <Routes>
      <Route index element={<Lista />} />
      <Route path="titulares" element={<Titulares />} />
      <Route path="titulares/:id" element={<FichaTitular />} />
      <Route path=":id" element={<Detalle />} />
    </Routes>
  );
}
