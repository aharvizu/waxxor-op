import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { roleMeta } from "@/lib/labels";
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
const CAPABILITIES: { label: string; check: (role: Role) => boolean }[] = [
  { label: "Acceso al portal interno", check: (r) => canAccessInternalPortal(r) },
  { label: "Operación (tickets, actividades, tiempo, clientes)", check: (r) => canAccessInternalPortal(r) },
  {
    label: "Gestión de proyectos (estado, salud, hitos, participantes)",
    check: (r) => hasRole(r, ["superadmin", "administrator", "director", "project_manager"]),
  },
  {
    label: "Aprobación y envío de reportes · plantillas",
    check: (r) => hasRole(r, ["superadmin", "administrator", "director", "project_manager"]),
  },
  {
    label: "Panel de indicadores (/indicators)",
    check: (r) => hasRole(r, ["superadmin", "administrator", "director", "project_manager"]),
  },
  {
    label: "Backfill de recurrencias",
    check: (r) => hasRole(r, ["superadmin", "administrator", "director"]),
  },
  {
    label: "Umbrales de indicadores · configuración de negocio",
    check: (r) => hasRole(r, ["superadmin", "administrator"]),
  },
  { label: "Gestión de usuarios e invitaciones", check: (r) => canManageUsers(r) },
  { label: "Definiciones SLA y calendario laboral (R7)", check: (r) => r === "superadmin" },
  { label: "API keys · diagnóstico de entorno", check: (r) => r === "superadmin" },
  { label: "Eliminación permanente (hard delete)", check: (r) => r === "superadmin" },
];

export default async function RolesSettingsPage() {
  await requireRole("superadmin", "administrator");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles y permisos"
        subtitle="Matriz visual del RBAC vigente. Los roles son fijos (PRD §7); el rol de cada usuario se asigna en Usuarios."
      />

      <Card>
        <CardHeader
          title="Matriz de capacidades"
          description="SuperAdmin pasa todas las verificaciones por regla de producto. Client no tiene acceso al portal interno."
        />
          <Table>
            <THead>
              <tr>
                <Th>Capacidad</Th>
                {ROLES.map((r) => (
                  <Th key={r}>
                    <Badge tone={roleMeta[r]?.tone ?? "slate"}>{roleMeta[r]?.label ?? r}</Badge>
                  </Th>
                ))}
              </tr>
            </THead>
            <tbody>
              {CAPABILITIES.map((cap) => (
                <tr key={cap.label} className="border-t border-edge">
                  <Td className="text-sm text-fg">{cap.label}</Td>
                  {ROLES.map((r) => (
                    <Td key={r}>
                      {cap.check(r) ? (
                        <Check className="size-4 text-success" aria-label="Permitido" />
                      ) : (
                        <Minus className="size-4 text-faint" aria-label="No permitido" />
                      )}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        <p className="border-t border-edge px-5 py-3 text-xs text-muted">
          Esta matriz refleja el código de autorización real (src/lib/roles.ts y las verificaciones
          requireRole de cada módulo) — no existe un motor de permisos aparte ni permisos
          granulares por usuario (OQ-10 abierta por decisión).
        </p>
      </Card>
    </div>
  );
}
