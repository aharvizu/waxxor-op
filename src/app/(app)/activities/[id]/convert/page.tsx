import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { activities, companies, users, workItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, CardHeader, PageHeader, buttonGhostClass } from "@/components/ui";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { getCatalogNames } from "@/lib/settings-data";
import { ConvertForm } from "./convert-form";

export const metadata: Metadata = { title: "Convert to ticket" };

export default async function ConvertActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) notFound();

  const [row] = await db
    .select({ activity: activities, item: workItems })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(
      and(
        eq(activities.id, activityId),
        eq(activities.organizationId, user.organizationId),
      ),
    );
  if (!row) notFound();
  if (row.activity.convertedAt && row.activity.convertedTicketId) {
    redirect(`/helpdesk/${row.activity.convertedTicketId}`);
  }
  // Archived activities cannot be converted — send the user back to restore first.
  if (row.activity.archivedAt) redirect(`/activities/${activityId}`);

  const locale = await getOrgLocale(user.organizationId);
  const { activityStatusMeta } = getLabels(locale);

  const [companyRows, userRows, categoryOptions] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.organizationId, user.organizationId))
      .orderBy(asc(companies.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.organizationId, user.organizationId))
      .orderBy(asc(users.name)),
    getCatalogNames(user.organizationId, "ticket_category"),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t(`Convertir “${row.item.title}”`, `Convert “${row.item.title}”`, locale)}
        subtitle={t(
          `Estado actual: ${
            activityStatusMeta[row.item.status]?.label ?? row.item.status
          }. El ticket resultante inicia como Abierto con un nuevo folio; esto no se puede deshacer automáticamente.`,
          `Current status: ${
            activityStatusMeta[row.item.status]?.label ?? row.item.status
          }. The resulting ticket starts as Open with a new folio; this cannot be undone automatically.`,
          locale,
        )}
        action={
          <Link href={`/activities/${activityId}`} className={buttonGhostClass}>
            <ArrowLeft /> {t("Volver a la actividad", "Back to activity", locale)}
          </Link>
        }
      />
      <Card className="overflow-hidden">
        <CardHeader
          title={t("Detalles del ticket", "Helpdesk details", locale)}
          description={t(
            "Solo lo que un ticket necesita y que la actividad aún no tiene.",
            "Only what a ticket needs and the activity doesn't have yet.",
            locale,
          )}
        />
        <div className="p-6">
          <ConvertForm
            activityId={row.activity.id}
            companyId={row.item.companyId}
            assigneeId={row.item.assigneeId}
            priority={row.item.priority}
            cancelled={row.item.status === "cancelled"}
            inProject={row.activity.projectId !== null}
            companies={companyRows}
            users={userRows}
            categoryOptions={categoryOptions}
          />
        </div>
      </Card>
    </div>
  );
}
