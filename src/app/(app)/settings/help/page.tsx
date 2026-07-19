import type { Metadata } from "next";
import { HELP_MODULE_LABELS } from "@/lib/help";
import { listTutorials } from "@/lib/help-data";
import { requireRole } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, THead, Table, Td, Th } from "@/components/ui";
import { ToggleTutorialButton } from "./help-settings-forms";

export const metadata: Metadata = { title: "Configuración · Ayuda" };

export default async function HelpSettingsPage() {
  await requireRole("superadmin", "administrator");
  const tutorials = await listTutorials({ includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ayuda"
        subtitle="Activa o desactiva los tutoriales del Centro de Ayuda. El contenido se administra por código (sin editor completo — fuera de alcance)."
      />
      <Card className="overflow-hidden">
        <CardHeader title={`Tutoriales (${tutorials.length})`} />
        <Table>
          <THead>
            <tr>
              <Th>Título</Th>
              <Th>Módulo</Th>
              <Th>Estado</Th>
              <Th>Acciones</Th>
            </tr>
          </THead>
          <tbody>
            {tutorials.map((t) => (
              <tr key={t.id} className="border-t border-edge">
                <Td className="font-medium text-fg">{t.title}</Td>
                <Td className="text-sm text-muted">{HELP_MODULE_LABELS[t.module]}</Td>
                <Td>
                  <Badge tone={t.isActive ? "green" : "slate"}>{t.isActive ? "Activo" : "Inactivo"}</Badge>
                </Td>
                <Td>
                  <ToggleTutorialButton id={t.id} isActive={t.isActive} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
