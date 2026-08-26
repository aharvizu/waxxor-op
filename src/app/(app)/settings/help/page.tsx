import type { Metadata } from "next";
import { HELP_MODULE_LABELS } from "@/lib/help";
import { listTutorials } from "@/lib/help-data";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t as translate } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, THead, Table, Td, Th } from "@/components/ui";
import { ToggleTutorialButton } from "./help-settings-forms";

export const metadata: Metadata = { title: "Configuración · Ayuda" };

export default async function HelpSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const tutorials = await listTutorials({ includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title={translate("Ayuda", "Help", locale)}
        subtitle={translate(
          "Activa o desactiva los tutoriales del Centro de Ayuda. El contenido se administra por código (sin editor completo — fuera de alcance).",
          "Enable or disable Help Center tutorials. Content is managed via code (no full editor — out of scope).",
          locale,
        )}
      />
      <Card className="overflow-hidden">
        <CardHeader title={`${translate("Tutoriales", "Tutorials", locale)} (${tutorials.length})`} />
        <Table>
          <THead>
            <tr>
              <Th>{translate("Título", "Title", locale)}</Th>
              <Th>{translate("Módulo", "Module", locale)}</Th>
              <Th>{translate("Estado", "Status", locale)}</Th>
              <Th>{translate("Acciones", "Actions", locale)}</Th>
            </tr>
          </THead>
          <tbody>
            {tutorials.map((tut) => (
              <tr key={tut.id} className="border-t border-edge">
                <Td className="font-medium text-fg">{tut.title}</Td>
                <Td className="text-sm text-muted">{HELP_MODULE_LABELS[tut.module]}</Td>
                <Td>
                  <Badge tone={tut.isActive ? "green" : "slate"}>{tut.isActive ? translate("Activo", "Active", locale) : translate("Inactivo", "Inactive", locale)}</Badge>
                </Td>
                <Td>
                  <ToggleTutorialButton id={tut.id} isActive={tut.isActive} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
