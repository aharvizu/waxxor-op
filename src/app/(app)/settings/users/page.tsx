import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { ROLES } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  CopyLinkButton,
  NewUserButton,
  RegenerateInvitationButton,
  UserActivationControl,
} from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Usuarios" };

export default async function UsersSettingsPage() {
  const me = await requireRole("superadmin");
  const locale = await getOrgLocale(me.organizationId);
  const { roleMeta } = getLabels(locale);
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, me.organizationId))
    .orderBy(asc(users.name));

  const activeInternal = rows.filter((u) => u.isActive && u.role !== "client" && !u.invitationToken);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Usuarios", "Users", locale)}
        subtitle={t(
          "Alta, invitaciones, roles, activación y reasignación de responsables.",
          "Onboarding, invitations, roles, activation, and reassignment of owners.",
          locale,
        )}
        action={<NewUserButton roles={ROLES.map((r) => ({ value: r, label: roleMeta[r]?.label ?? r }))} />}
      />

      <Card className="overflow-visible">
        <CardHeader title={`${t("Equipo", "Team", locale)} (${rows.length})`} />
        <Table>
          <THead>
            <tr>
              <Th>{t("Usuario", "User", locale)}</Th>
              <Th>{t("Rol", "Role", locale)}</Th>
              <Th>{t("Estado", "Status", locale)}</Th>
              <Th>{t("Acciones", "Actions", locale)}</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-edge">
                <Td>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={u.name} />
                    <span>
                      <Link href={`/settings/users/${u.id}`} className="font-medium text-fg hover:underline">
                        {u.name}
                      </Link>
                      <span className="block text-xs text-muted">{u.email}</span>
                    </span>
                  </span>
                </Td>
                <Td>
                  <Badge tone={roleMeta[u.role]?.tone ?? "slate"}>
                    {roleMeta[u.role]?.label ?? u.role}
                  </Badge>
                </Td>
                <Td>
                  {u.invitationToken ? (
                    <Badge tone="amber">{t("Invitación pendiente", "Pending invitation", locale)}</Badge>
                  ) : u.isActive ? (
                    <Badge tone="green">{t("Activo", "Active", locale)}</Badge>
                  ) : (
                    <Badge tone="red">{t("Desactivado", "Deactivated", locale)}</Badge>
                  )}
                </Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {u.invitationToken ? (
                      <>
                        <CopyLinkButton path={`/invite/${u.invitationToken}`} />
                        <RegenerateInvitationButton userId={u.id} />
                      </>
                    ) : null}
                    {String(u.id) !== me.id ? (
                      <UserActivationControl
                        userId={u.id}
                        isActive={u.isActive}
                        reassignTargets={activeInternal
                          .filter((t) => t.id !== u.id)
                          .map((t) => ({ id: t.id, name: t.name }))}
                      />
                    ) : (
                      <span className="text-xs text-muted">{t("Tu cuenta", "Your account", locale)}</span>
                    )}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-edge px-5 py-3 text-xs text-muted">
          {t(
            "Editar nombre, email, rol o contraseña y la eliminación permanente (solo si el usuario no tiene trabajo referenciado) viven en la ficha de cada usuario. Desactivar bloquea el inicio de sesión sin borrar historial; al desactivar puedes reasignar su trabajo abierto.",
            "Editing name, email, role, or password, and permanent deletion (only if the user has no referenced work) live on each user's detail page. Deactivating blocks sign-in without erasing history; when deactivating you can reassign their open work.",
            locale,
          )}
        </p>
      </Card>
    </div>
  );
}
