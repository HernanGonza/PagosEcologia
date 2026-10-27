import { DashboardCard, DetailHeader, DetailTag } from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared';
import { Pagina } from '../comunes';

/** Pantallas que dependen de definiciones con Recaudaciones o del proveedor de pago. */
export default function Pendiente({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <Pagina>
      <DashboardCard className="flex flex-col gap-4">
        <DetailHeader title={titulo}>
          <DetailTag color="var(--chart-3)">Por definir</DetailTag>
        </DetailHeader>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DashboardCard>
    </Pagina>
  );
}
