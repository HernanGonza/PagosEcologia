import { Award, Bug, Droplets, Factory, Fish, FileText, Leaf, Mountain, Shield, Trees, Truck, type LucideIcon } from 'lucide-react';

const ICONOS: Record<string, LucideIcon> = {
  trees: Trees, leaf: Leaf, 'file-text': FileText, fish: Fish, truck: Truck, factory: Factory,
  droplets: Droplets, mountain: Mountain, award: Award, bug: Bug, shield: Shield,
};

export default function Icono({ nombre, size = 28 }: { nombre: string | null; size?: number }) {
  const C = (nombre && ICONOS[nombre]) || FileText;
  return <C size={size} aria-hidden />;
}
