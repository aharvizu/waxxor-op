import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { roleMeta } from "@/lib/labels";
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
  InviteUserForm,
  RegenerateInvitationButton,
  UserActivationControl,
} from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Usuarios" };

export default async function UsersSettingsPage() {
  const me = await requireRole("superadmin");
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, me.organizationId))
    .orderBy(asc(users.name));

  const activeInternal = rows.filter((u) => u.isActive && u.role !== "client" && !u.invitationToken);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle="Alta, invitaciones, roles, activación y reasignación de responsables."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-1">
          <CardHeader
            title="Invitar usuario"
            description="Crea la cuenta y comparte el enlace de activación (Watson no envía correos)."
          />
          <InviteUserForm
            roles={ROLES.map((r) => ({ value: r, label: roleMeta[r]?.label ?? r }))}
          />
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title={`Equipo (${rows.length})`} />
          <Table>
            <THead>
              <tr>
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
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
                      <Badge tone="amber">Invitación pendiente</Badge>
                    ) : u.isActive ? (
                      <Badge tone="green">Activo</Badge>
                    ) : (
                      <Badge tone="red">Desactivado</Badge>
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
                        <span className="text-xs text-muted">Tu cuenta</span>
                      )}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="border-t border-edge px-5 py-3 text-xs text-muted">
            Editar nombre, email, rol o contraseña y la eliminación permanente (solo si el usuario no
            tiene trabajo referenciado) viven en la ficha de cada usuario. Desactivar bloquea el
            inicio de sesión sin borrar historial; al desactivar puedes reasignar su trabajo abierto.
          </p>
        </Card>
      </div>
    </div>
  );
}
