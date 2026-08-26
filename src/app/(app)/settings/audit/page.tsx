import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { buildAuditConditions, type AuditFilters } from "@/lib/audit-query";
import { fmtDateTime } from "@/lib/format";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import {
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
  inputClass,
  labelClass,
} from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = { title: "Configuración · Auditoría" };

const PAGE_SIZE = 100;

export default async function AuditSettingsPage({
  searchParams,
}: {
  searchParams: Promise<AuditFilters>;
}) {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const filters = await searchParams;
  const conditions = buildAuditConditions(user.organizationId, filters);

  const [rows, entityTypes, actors] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        action: auditLogs.action,
        field: auditLogs.field,
        oldValue: auditLogs.oldValue,
        newValue: auditLogs.newValue,
        source: auditLogs.source,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE),
    db
      .select({ entityType: auditLogs.entityType })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, user.organizationId))
      .groupBy(auditLogs.entityType)
      .orderBy(auditLogs.entityType),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.organizationId, user.organizationId))
      .orderBy(users.name),
  ]);

  const exportQuery = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => typeof v === "string" && v !== "") as [string, string][],
  ).toString();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Auditoría", "Audit", locale)}
        subtitle={t(
          "Consulta global del AuditLog con filtros y exportación CSV.",
          "Global AuditLog query with filters and CSV export.",
          locale,
        )}
        action={
          <a
            href={`/api/audit/export${exportQuery ? `?${exportQuery}` : ""}`}
            className={buttonSecondaryClass}
          >
            <Download className="size-4" aria-hidden /> {t("Exportar CSV", "Export CSV", locale)}
          </a>
        }
      />

      <Card className="p-5">
        <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <div>
            <label className={labelClass}>{t("Entidad", "Entity", locale)}</label>
            <SearchableSelect
              name="entityType"
              defaultValue={filters.entityType ?? ""}
              options={[{ value: "", label: t("Todas", "All", locale) }, ...entityTypes.map((et) => ({ value: et.entityType, label: et.entityType }))]}
            />
          </div>
          <div>
            <label className={labelClass}>{t("Acción", "Action", locale)}</label>
            <SearchableSelect
              name="action"
              defaultValue={filters.action ?? ""}
              options={[
                { value: "", label: t("Todas", "All", locale) },
                { value: "create", label: "create" },
                { value: "update", label: "update" },
                { value: "delete", label: "delete" },
              ]}
            />
          </div>
          <div>
            <label className={labelClass}>{t("Actor", "Actor", locale)}</label>
            <SearchableSelect
              name="userId"
              defaultValue={filters.userId ?? ""}
              options={[{ value: "", label: t("Todos", "All", locale) }, ...actors.map((a) => ({ value: String(a.id), label: a.name }))]}
            />
          </div>
          <div>
            <label className={labelClass}>{t("ID de entidad", "Entity ID", locale)}</label>
            <input name="entityId" defaultValue={filters.entityId ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t("Desde", "From", locale)}</label>
            <input name="from" type="date" defaultValue={filters.from ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t("Hasta", "To", locale)}</label>
            <input name="to" type="date" defaultValue={filters.to ?? ""} className={inputClass} />
          </div>
          <div className="col-span-2 md:col-span-6">
            <button type="submit" className={buttonSecondaryClass}>{t("Filtrar", "Filter", locale)}</button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={`${t("Eventos", "Events", locale)} (${rows.length}${rows.length === PAGE_SIZE ? `, ${t("últimos", "latest", locale)} ${PAGE_SIZE}` : ""})`}
          description={t(
            "La exportación CSV aplica los mismos filtros, con un límite de 5,000 filas.",
            "CSV export applies the same filters, with a limit of 5,000 rows.",
            locale,
          )}
        />
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<ScrollText className="size-6" />} title={t("Sin eventos", "No events", locale)}>
              {t(
                "Ningún evento de auditoría coincide con los filtros.",
                "No audit event matches the filters.",
                locale,
              )}
            </EmptyState>
          </div>
        ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{t("Fecha", "Date", locale)}</Th>
                  <Th>{t("Actor", "Actor", locale)}</Th>
                  <Th>{t("Entidad", "Entity", locale)}</Th>
                  <Th>{t("Acción", "Action", locale)}</Th>
                  <Th>{t("Campo", "Field", locale)}</Th>
                  <Th>{t("Anterior", "Old", locale)}</Th>
                  <Th>{t("Nuevo", "New", locale)}</Th>
                  <Th>{t("Origen", "Source", locale)}</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-edge align-top">
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                    <Td className="text-xs">{r.actorName ?? t("Sistema", "System", locale)}</Td>
                    <Td className="text-xs">
                      {r.entityType} #{r.entityId}
                    </Td>
                    <Td>
                      <Badge
                        tone={r.action === "delete" ? "red" : r.action === "create" ? "green" : "blue"}
                      >
                        {r.action}
                      </Badge>
                    </Td>
                    <Td className="text-xs">{r.field ?? "—"}</Td>
                    <Td className="max-w-48 text-xs text-muted">
                      <span className="block max-w-48 truncate" title={r.oldValue ?? undefined}>
                        {r.oldValue ?? "—"}
                      </span>
                    </Td>
                    <Td className="max-w-48 text-xs text-muted">
                      <span className="block max-w-48 truncate" title={r.newValue ?? undefined}>
                        {r.newValue ?? "—"}
                      </span>
                    </Td>
                    <Td className="text-xs">{r.source}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
        )}
      </Card>
    </div>
  );
}
