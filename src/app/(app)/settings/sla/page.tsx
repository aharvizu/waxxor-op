import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Timer } from "lucide-react";
import { db } from "@/db";
import { businessCalendars, slaDefinitions } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { listTicketPriorities } from "@/lib/ticket-catalogs";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { CalendarForm, CreateDefinitionForm, DefinitionRow } from "./sla-forms";

export const metadata: Metadata = { title: "Configuración · SLA" };

export default async function SlaPage() {
  const me = await requireRole("superadmin");

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
        subtitle="Service level definitions and the work calendar. Changes never alter existing tickets — their SLA is snapshotted at assignment."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {definitions.length === 0 ? (
            <EmptyState icon={<Timer />} title="No SLA definitions yet">
              Create one per priority on the right. Mark it as default and every
              new ticket with that priority gets it automatically.
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
              title="Work calendar"
              description="Used by business-hours SLAs. One calendar per organization (holidays are stored for the future but not evaluated yet)."
            />
            <div className="p-5">
              <CalendarForm
                calendar={{
                  timezone: calendar?.timezone ?? "America/Mexico_City",
                  workDays: (calendar?.workDays as number[]) ?? [1, 2, 3, 4, 5],
                  workStartMinute: calendar?.workStartMinute ?? 540,
                  workEndMinute: calendar?.workEndMinute ?? 1080,
                }}
              />
            </div>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="New SLA definition" description="Targets in minutes." />
          <div className="p-5">
            <CreateDefinitionForm priorities={priorities} />
          </div>
        </Card>
      </div>
    </div>
  );
}
