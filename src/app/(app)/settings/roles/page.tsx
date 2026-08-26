import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { ROLES, canAccessInternalPortal, canManageUsers, hasRole, type Role } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, THead, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Configuración · Roles y permisos" };

/**
 * Visual administration of the EXISTING RBAC (src/lib/roles.ts + requireRole
 * gates). Deliberately read-only: no new permission engine, no per-user grants
 * (OQ-10 stays open for the fine-grained matrix). Role assignment happens per
 * user in Usuarios.
 */
const CAPABILITIES: { labelEs: string; labelEn: string; check: (role: Role) => boolean }[] = [
  { labelEs: "Acceso al portal interno", labelEn: "Access to the internal portal", check: (r) => canAccessInternalPortal(r) },
  {
    labelEs: "Operación (tickets, actividades, tiempo, clientes)",
    labelEn: "Operations (tickets, activities, time, clients)",
    check: (r) => canAccessInternalPortal(r),
  },
  {
    labelEs: "Gestión de proyectos (estado, salud, hitos, participantes)",
    labelEn: "Project management (status, health, milestones, participants)",
    check: (r) => hasRole(r, ["superadmin", "administrator", "director", "project_manager"]),
  },
  {
    labelEs: "Aprobación y envío de reportes · plantillas",
    labelEn: "Report approval and submission · templates",
    check: (r) => hasRole(r, ["superadmin", "administrator", "director", "project_manager"]),
  },
  {
    labelEs: "Panel de indicadores (/indicators)",
    labelEn: "Indicators dashboard (/indicators)",
    check: (r) => hasRole(r, ["superadmin", "administrator", "director", "project_manager"]),
  },
  {
    labelEs: "Backfill de recurrencias",
    labelEn: "Recurrence backfill",
    check: (r) => hasRole(r, ["superadmin", "administrator", "director"]),
  },
  {
    labelEs: "Umbrales de indicadores · configuración de negocio",
    labelEn: "Indicator thresholds · business configuration",
    check: (r) => hasRole(r, ["superadmin", "administrator"]),
  },
  { labelEs: "Gestión de usuarios e invitaciones", labelEn: "User management and invitations", check: (r) => canManageUsers(r) },
  { labelEs: "Definiciones SLA y calendario laboral (R7)", labelEn: "SLA definitions and work calendar (R7)", check: (r) => r === "superadmin" },
  { labelEs: "API keys · diagnóstico de entorno", labelEn: "API keys · environment diagnostics", check: (r) => r === "superadmin" },
  { labelEs: "Eliminación permanente (hard delete)", labelEn: "Permanent deletion (hard delete)", check: (r) => r === "superadmin" },
];

export default async function RolesSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const { roleMeta } = getLabels(locale);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Roles y permisos", "Roles and permissions", locale)}
        subtitle={t(
          "Matriz visual del RBAC vigente. Los roles son fijos (PRD §7); el rol de cada usuario se asigna en Usuarios.",
          "Visual matrix of the current RBAC. Roles are fixed (PRD §7); each user's role is assigned in Users.",
          locale,
        )}
      />

      <Card>
        <CardHeader
          title={t("Matriz de capacidades", "Capability matrix", locale)}
          description={t(
            "SuperAdmin pasa todas las verificaciones por regla de producto. Client no tiene acceso al portal interno.",
            "SuperAdmin passes every check by product rule. Client has no access to the internal portal.",
            locale,
          )}
        />
          <Table>
            <THead>
              <tr>
                <Th>{t("Capacidad", "Capability", locale)}</Th>
                {ROLES.map((r) => (
                  <Th key={r}>
                    <Badge tone={roleMeta[r]?.tone ?? "slate"}>{roleMeta[r]?.label ?? r}</Badge>
                  </Th>
                ))}
              </tr>
            </THead>
            <tbody>
              {CAPABILITIES.map((cap) => (
                <tr key={cap.labelEs} className="border-t border-edge">
                  <Td className="text-sm text-fg">{t(cap.labelEs, cap.labelEn, locale)}</Td>
                  {ROLES.map((r) => (
                    <Td key={r}>
                      {cap.check(r) ? (
                        <Check className="size-4 text-success" aria-label={t("Permitido", "Allowed", locale)} />
                      ) : (
                        <Minus className="size-4 text-faint" aria-label={t("No permitido", "Not allowed", locale)} />
                      )}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        <p className="border-t border-edge px-5 py-3 text-xs text-muted">
          {t(
            "Esta matriz refleja el código de autorización real (src/lib/roles.ts y las verificaciones requireRole de cada módulo) — no existe un motor de permisos aparte ni permisos granulares por usuario (OQ-10 abierta por decisión).",
            "This matrix reflects the real authorization code (src/lib/roles.ts and each module's requireRole checks) — there is no separate permission engine or per-user granular permissions (OQ-10 open by decision).",
            locale,
          )}
        </p>
      </Card>
    </div>
  );
}
