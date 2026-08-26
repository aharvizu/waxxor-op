import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
import { ROLES } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { AlertCircle, Trash2 } from "lucide-react";
import { Card, CardHeader, PageHeader, buttonDangerClass, inputClass, labelClass } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { deleteUser, updateUser } from "../user-detail-actions";

export const metadata: Metadata = { title: "Configuración · Usuario" };

function errorMessage(error: string, locale: Locale): string | undefined {
  switch (error) {
    case "email-taken":
      return t("Ese correo ya está en uso por otro usuario.", "That email is already in use by another user.", locale);
    case "short-password":
      return t("La nueva contraseña debe tener al menos 8 caracteres.", "The new password must be at least 8 characters.", locale);
    case "self-delete":
      return t("No puedes eliminar tu propia cuenta.", "You cannot delete your own account.", locale);
    case "in-use":
      return t(
        "Este usuario tiene tickets, tareas o comentarios asignados y no se puede eliminar.",
        "This user has tickets, tasks, or comments assigned and cannot be deleted.",
        locale,
      );
    default:
      return undefined;
  }
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireRole("superadmin");
  const locale = await getOrgLocale(me.organizationId);
  const { roleMeta } = getLabels(locale);
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const userId = Number(id);
  if (!Number.isInteger(userId)) notFound();

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, me.organizationId)));
  if (!user) notFound();

  const errMsg = error ? errorMessage(error, locale) : undefined;

  return (
    <div className="max-w-2xl">
      <PageHeader title={user.name} subtitle={t("Editar detalles del usuario.", "Edit user details.", locale)} />

      {errMsg ? (
        <div
          role="alert"
          className="mb-5 flex items-center gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" />
          {errMsg}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title={t("Perfil", "Profile", locale)}
          description={t("Información general y acceso.", "General information and access.", locale)}
        />
        <form action={updateUser} className="space-y-4 p-6">
          <input type="hidden" name="id" value={user.id} />
          <div>
            <label htmlFor="name" className={labelClass}>
              {t("Nombre completo", "Full name", locale)}
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={user.name}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className={labelClass}>
                {t("Correo", "Email", locale)}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={user.email}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="role" className={labelClass}>
                {t("Rol", "Role", locale)}
              </label>
              <SearchableSelect
                id="role"
                name="role"
                defaultValue={user.role}
                options={ROLES.map((r) => ({ value: r, label: roleMeta[r]?.label ?? r }))}
              />
            </div>
            <div>
              <label htmlFor="title" className={labelClass}>
                {t("Puesto", "Job title", locale)}
              </label>
              <input
                id="title"
                name="title"
                defaultValue={user.title ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                {t("Teléfono", "Phone", locale)}
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={user.phone ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>
              {t("Nueva contraseña (déjalo en blanco para conservar la actual)", "New password (leave blank to keep current)", locale)}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <SubmitButton>{t("Guardar cambios", "Save changes", locale)}</SubmitButton>
        </form>
      </Card>

      <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 border-danger/20 p-6">
        <div>
          <h2 className="text-sm font-semibold text-fg">{t("Eliminar usuario", "Delete user", locale)}</h2>
          <p className="mt-1 text-sm text-muted">
            {t(
              "Elimina esta cuenta de forma permanente. Ya no podrá iniciar sesión.",
              "Removes this account permanently. They will no longer be able to sign in.",
              locale,
            )}
          </p>
        </div>
        <form action={deleteUser}>
          <input type="hidden" name="id" value={user.id} />
          <button type="submit" className={buttonDangerClass}>
            <Trash2 /> {t("Eliminar", "Delete", locale)}
          </button>
        </form>
      </Card>
    </div>
  );
}
