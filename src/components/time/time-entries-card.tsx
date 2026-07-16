import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries, users } from "@/db/schema";
import { Badge, Card, CardHeader } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { formatMinutes, summarizeByUser } from "@/lib/time-entries";
import { requireUser } from "@/lib/session";
import { AddTimeEntryForm, TimeEntryRow } from "./time-entry-forms";

/**
 * Shared "Time" card for activity and ticket detail pages.
 * Totals are computed here from time_entries — never stored elsewhere.
 */
export async function TimeEntriesCard({
  workItemId,
  readOnly = false,
}: {
  workItemId: number;
  readOnly?: boolean;
}) {
  const user = await requireUser();

  const [entries, technicianRows] = await Promise.all([
    db
      .select({
        entry: timeEntries,
        userName: users.name,
      })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .where(
        and(
          eq(timeEntries.workItemId, workItemId),
          eq(timeEntries.organizationId, user.organizationId),
        ),
      )
      .orderBy(asc(timeEntries.date), asc(timeEntries.id)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(eq(users.organizationId, user.organizationId), ne(users.role, "client")),
      )
      .orderBy(asc(users.name)),
  ]);

  const active = entries.filter((e) => !e.entry.voidedAt);
  const totalMinutes = active.reduce((s, e) => s + e.entry.durationMinutes, 0);
  const billableMinutes = active
    .filter((e) => e.entry.billingStatus === "billable")
    .reduce((s, e) => s + e.entry.durationMinutes, 0);
  const totalAmount = active.reduce(
    (s, e) => s + (e.entry.calculatedAmount ? Number(e.entry.calculatedAmount) : 0),
    0,
  );
  const perUser = summarizeByUser(
    entries.map((e) => ({
      userId: e.entry.userId,
      userName: e.userName,
      durationMinutes: e.entry.durationMinutes,
      voidedAt: e.entry.voidedAt,
    })),
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Time"
        description="Manual sessions logged against this work item."
        action={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="blue">Total {formatMinutes(totalMinutes)}</Badge>
            <Badge tone="green">Billable {formatMinutes(billableMinutes)}</Badge>
            {totalAmount > 0 ? (
              <Badge tone="purple">{fmtMoney(totalAmount)}</Badge>
            ) : null}
          </div>
        }
      />
      <div className="space-y-5 p-5">
        {perUser.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-xs text-muted">
            {perUser.map((u) => (
              <li
                key={u.userId}
                className="rounded-full border border-edge bg-subtle px-2.5 py-1 tabular-nums"
              >
                {u.userName}: {formatMinutes(u.minutes)}
              </li>
            ))}
          </ul>
        ) : null}

        {entries.length === 0 ? (
          <p className="text-sm text-muted">No time logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <TimeEntryRow
                key={e.entry.id}
                entry={{
                  id: e.entry.id,
                  userId: e.entry.userId,
                  userName: e.userName ?? "Unknown",
                  date: e.entry.date,
                  durationMinutes: e.entry.durationMinutes,
                  timeType: e.entry.timeType,
                  billingStatus: e.entry.billingStatus,
                  modality: e.entry.modality,
                  description: e.entry.description,
                  result: e.entry.result,
                  hourlyRate: e.entry.hourlyRate,
                  internalHourlyCost: e.entry.internalHourlyCost,
                  calculatedAmount: e.entry.calculatedAmount,
                  voided: e.entry.voidedAt !== null,
                }}
                technicians={technicianRows}
                canDelete={user.role === "superadmin"}
                readOnly={readOnly}
              />
            ))}
          </ul>
        )}

        {!readOnly ? (
          <AddTimeEntryForm
            workItemId={workItemId}
            technicians={technicianRows}
            currentUserId={Number(user.id)}
          />
        ) : null}
      </div>
    </Card>
  );
}
