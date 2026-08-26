import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Timer } from "lucide-react";
import { db } from "@/db";
import { businessCalendars, slaDefinitions } from "@/db/schema";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { listTicketPriorities } from "@/lib/ticket-catalogs";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { CalendarForm, CreateDefinitionForm, DefinitionRow } from "./sla-forms";

export const metadata: Metadata = { title: "Configuración · SLA" };

/**
 * Computed once, server-side (Node's own ICU data), and passed down as a
 * prop rather than recomputed inside the client component — a client-side
 * `Intl.supportedValuesOf("timeZone")` call can return a different
 * order/set than the server used to render, which causes a hydration
 * mismatch on a ~400-option <select> and can silently reset the user's
 * selection right as they interact with it (2026-07-25 bugfix).
 */
const TIMEZONES: string[] = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

export default async function SlaPage() {
  const me = await requireRole("superadmin");
  const locale = await getOrgLocale(me.organizationId);

  const [definitions, [calendar], priorities] = await Promise.all([
    db
      .select()
      .from(slaDefinitions)
      .where(eq(slaDefinitions.organizationId, me.organizationId))
      .orderBy(asc(slaDefinitions.priorityId), asc(slaDefinitions.name)),
    db
      .select()
      .from(businessCalendars)
      .where(eq(businessCalendars.organizationId, me.organizationId)),
    listTicketPriorities(me.organizationId, { includeInactive: true }),
  ]);
  const priorityById = new Map(priorities.map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader
        title="SLA"
        subtitle={t(
          "Definiciones de nivel de servicio y el calendario laboral. Los cambios nunca alteran los tickets existentes — su SLA queda fijado al momento de la asignación.",
          "Service level definitions and the work calendar. Changes never alter existing tickets — their SLA is snapshotted at assignment.",
          locale,
        )}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {definitions.length === 0 ? (
            <EmptyState icon={<Timer />} title={t("Aún no hay definiciones de SLA", "No SLA definitions yet", locale)}>
              {t(
                "Crea una por prioridad a la derecha. Márcala como predeterminada y cada ticket nuevo con esa prioridad la obtiene automáticamente.",
                "Create one per priority on the right. Mark it as default and every new ticket with that priority gets it automatically.",
                locale,
              )}
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {definitions.map((d) => (
                <DefinitionRow key={d.id} definition={d} priority={priorityById.get(d.priorityId)} priorities={priorities} />
              ))}
            </ul>
          )}

          <Card className="overflow-hidden">
            <CardHeader
              title={t("Calendario laboral", "Work calendar", locale)}
              description={t(
                "Usado por los SLA en horario laboral. Un calendario por organización (los días festivos se guardan para el futuro pero aún no se evalúan).",
                "Used by business-hours SLAs. One calendar per organization (holidays are stored for the future but not evaluated yet).",
                locale,
              )}
            />
            <div className="p-5">
              <CalendarForm
                calendar={{
                  timezone: calendar?.timezone ?? "America/Mexico_City",
                  workDays: (calendar?.workDays as number[]) ?? [1, 2, 3, 4, 5],
                  workStartMinute: calendar?.workStartMinute ?? 540,
                  workEndMinute: calendar?.workEndMinute ?? 1080,
                }}
                timezones={TIMEZONES}
              />
            </div>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader
            title={t("Nueva definición de SLA", "New SLA definition", locale)}
            description={t("Objetivos en minutos.", "Targets in minutes.", locale)}
          />
          <div className="p-5">
            <CreateDefinitionForm priorities={priorities} />
          </div>
        </Card>
      </div>
    </div>
  );
}
