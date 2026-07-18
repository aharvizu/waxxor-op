import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CircleDollarSign, Plus, Ticket } from "lucide-react";
import { getClientsDirectory } from "@/lib/client360-data";
import { renewalBucket } from "@/lib/client360";
import { fmtDate } from "@/lib/format";
import { clientStatusMeta, renewalBucketMeta } from "@/lib/labels";
import { requireUser } from "@/lib/session";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
  buttonSecondaryClass,
  cx,
  inputClass,
} from "@/components/ui";
import { ClientForm } from "./client-form";

export const metadata: Metadata = { title: "Clients" };

const FILTERS = [
  ["", "All"],
  ["renewal", "Renewal ≤ 30d"],
  ["open_tickets", "Open tickets"],
  ["pending_billing", "Pending billing"],
] as const;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; filter?: string }>;
}) {
  const user = await requireUser();
  const { q, status, filter } = await searchParams;
  const validFilter =
    filter === "renewal" || filter === "open_tickets" || filter === "pending_billing"
      ? filter
      : undefined;

  const rows = await getClientsDirectory(user.organizationId, { q, status, filter: validFilter });
  const now = new Date();

  const buildHref = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = { q, status, filter, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/clients?${qs}` : "/clients";
  };

  return (
    <div>
      <PageHeader title="Clients" subtitle="Every account you support, quote, and report to." />

      <form method="get" className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name, contact, email, phone, service…"
          className={cx(inputClass, "max-w-sm")}
        />
        <select name="status" defaultValue={status ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">All statuses</option>
          {Object.entries(clientStatusMeta).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        <button type="submit" className={buttonSecondaryClass}>
          Search
        </button>
      </form>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={buildHref({ filter: value || undefined })}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              (validFilter ?? "") === value
                ? "bg-primary-soft text-primary"
                : "border border-edge text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          {rows.length === 0 ? (
            <EmptyState icon={<Building2 />} title="No clients found">
              Try a different search, or add your first client on the right — it
              becomes available across tickets, activities, projects, and reports.
            </EmptyState>
          ) : (
            <Card className="overflow-visible">
              <Table>
                <THead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Status</Th>
                    <Th>Primary contact</Th>
                    <Th>Account owner</Th>
                    <Th>Services</Th>
                    <Th>Open tickets</Th>
                    <Th>Billing</Th>
                    <Th>Next renewal</Th>
                    <Th>Actions</Th>
                  </tr>
                </THead>
                <tbody className="divide-y divide-edge">
                  {rows.map((c) => {
                    const bucket = c.nextRenewal ? renewalBucket(c.nextRenewal, now) : null;
                    return (
                      <tr key={c.id} className="group transition-colors hover:bg-subtle">
                        <Td>
                          <Link
                            href={`/clients/${c.id}`}
                            className="flex items-center gap-3 font-medium text-fg transition-colors group-hover:text-primary"
                          >
                            <Avatar name={c.name} size="sm" square />
                            {c.name}
                          </Link>
                        </Td>
                        <Td>
                          <Badge tone={clientStatusMeta[c.status]?.tone ?? "slate"}>
                            {clientStatusMeta[c.status]?.label ?? c.status}
                          </Badge>
                        </Td>
                        <Td className="text-muted">{c.primaryContact ?? "—"}</Td>
                        <Td className="text-muted">{c.accountOwnerName ?? "—"}</Td>
                        <Td className="text-muted tabular-nums">{c.activeServices}</Td>
                        <Td className={cx("tabular-nums", c.openTickets > 0 ? "text-fg" : "text-muted")}>
                          {c.openTickets}
                        </Td>
                        <Td>
                          {c.pendingBilling > 0 ? (
                            <Badge tone="amber">{c.pendingBilling} pending</Badge>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </Td>
                        <Td>
                          {c.nextRenewal && bucket ? (
                            <Badge tone={renewalBucketMeta[bucket]?.tone ?? "slate"}>
                              {fmtDate(c.nextRenewal)}
                            </Badge>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Link
                              href={`/helpdesk/new?clientId=${c.id}`}
                              title="New ticket"
                              className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg"
                            >
                              <Ticket className="size-4" />
                            </Link>
                            <Link
                              href={`/activities/new?clientId=${c.id}`}
                              title="New activity"
                              className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg"
                            >
                              <Plus className="size-4" />
                            </Link>
                            <Link
                              href={`/clients/${c.id}?tab=billing`}
                              title="Billing"
                              className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg"
                            >
                              <CircleDollarSign className="size-4" />
                            </Link>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          )}
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="Add client" description="A new customer account." />
          <div className="p-5">
            <ClientForm submitLabel="Add client" />
          </div>
        </Card>
      </div>
    </div>
  );
}
