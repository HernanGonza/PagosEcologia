import { Route, Routes } from 'react-router-dom';
import Detalle from './Detalle';
import Lista from './Lista';

/** Panel de Fitosanitarios: los técnicos revisan las solicitudes antes del pago. */
export default function PanelFitosanitarios() {
  return (
    <Routes>
      <Route index element={<Lista />} />
      <Route path=":id" element={<Detalle />} />
    </Routes>
  );
}
