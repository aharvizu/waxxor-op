import { Badge, Card, CardHeader, buttonSecondaryClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/format";
import { slaHealthMeta } from "@/lib/labels";
import { slaHealth, ticketCalendar } from "@/lib/sla";
import { formatMinutes } from "@/lib/time-entries";
import type { tickets } from "@/db/schema";
import { registerFirstResponse } from "@/app/(app)/helpdesk/actions";

type Ticket = typeof tickets.$inferSelect;

function HealthLine({
  label,
  targetAt,
  totalMinutes,
  fulfilledAt,
  ticket,
}: {
  label: string;
  targetAt: Date;
  totalMinutes: number;
  fulfilledAt: Date | null;
  ticket: Ticket;
}) {
  const { health, remainingMinutes } = slaHealth({
    now: new Date(),
    targetAt,
    totalMinutes,
    fulfilledAt,
    cal: ticketCalendar(ticket),
  });
  const meta = slaHealthMeta[health];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <div className="font-medium text-fg">{label}</div>
        <div className="text-xs text-muted tabular-nums">
          Target {fmtDateTime(targetAt)}
          {fulfilledAt ? ` · Done ${fmtDateTime(fulfilledAt)}` : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!fulfilledAt ? (
          <span
            className={
              health === "overdue" || health === "critical"
                ? "text-sm font-semibold text-danger tabular-nums"
                : "text-sm text-muted tabular-nums"
            }
          >
            {remainingMinutes >= 0
              ? `${formatMinutes(remainingMinutes)} left`
              : `${formatMinutes(-remainingMinutes)} over`}
          </span>
        ) : null}
        <Badge tone={meta?.tone ?? "slate"}>{meta?.label ?? health}</Badge>
      </div>
    </div>
  );
}

/** SLA panel for the ticket detail. Server component — health computed per render. */
export function SlaPanel({ ticket }: { ticket: Ticket }) {
  if (!ticket.slaDefinitionId || !ticket.firstResponseTargetAt || !ticket.resolutionTargetAt) {
    return (
      <Card className="h-fit overflow-hidden">
        <CardHeader title="SLA" description="No SLA applies to this ticket." />
      </Card>
    );
  }

  const paused = ticket.slaPausedAt !== null;

  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader
        title="SLA"
        description={`${ticket.slaName} · ${
          ticket.slaBusinessHoursOnly ? `business hours (${ticket.slaTimezone})` : "24/7"
        }`}
        action={paused ? <Badge tone="amber">Paused</Badge> : undefined}
      />
      <div className="space-y-4 p-5">
        <HealthLine
          label="First response"
          targetAt={ticket.firstResponseTargetAt}
          totalMinutes={ticket.slaFirstResponseMinutes ?? 0}
          fulfilledAt={ticket.firstResponseAt}
          ticket={ticket}
        />
        <HealthLine
          label="Resolution"
          targetAt={ticket.resolutionTargetAt}
          totalMinutes={ticket.slaResolutionMinutes ?? 0}
          fulfilledAt={ticket.resolvedAt}
          ticket={ticket}
        />
        {ticket.slaPausedMinutes > 0 || paused ? (
          <p className="text-xs text-muted">
            Paused {formatMinutes(ticket.slaPausedMinutes)} in total
            {paused ? " · currently paused (waiting)" : ""}. The resolution target
            extends while paused.
          </p>
        ) : null}
        {!ticket.firstResponseAt ? (
          <form action={registerFirstResponse}>
            <input type="hidden" name="id" value={ticket.id} />
            <SubmitButton className={buttonSecondaryClass}>
              Register first response
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </Card>
  );
}
