import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { buildAuditConditions, type AuditFilters } from "@/lib/audit-query";
import { fmtDateTime } from "@/lib/format";
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
import { ScrollText } from "lucide-react";

export const metadata: Metadata = { title: "Configuración · Auditoría" };

const PAGE_SIZE = 100;

export default async function AuditSettingsPage({
  searchParams,
}: {
  searchParams: Promise<AuditFilters>;
}) {
  const user = await requireRole("superadmin", "administrator");
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
        title="Auditoría"
        subtitle="Consulta global del AuditLog con filtros y exportación CSV."
        action={
          <a
            href={`/api/audit/export${exportQuery ? `?${exportQuery}` : ""}`}
            className={buttonSecondaryClass}
          >
            <Download className="size-4" aria-hidden /> Exportar CSV
          </a>
        }
      />

      <Card className="p-5">
        <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <div>
            <label className={labelClass}>Entidad</label>
            <select name="entityType" defaultValue={filters.entityType ?? ""} className={inputClass}>
              <option value="">Todas</option>
              {entityTypes.map((t) => (
                <option key={t.entityType} value={t.entityType}>{t.entityType}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Acción</label>
            <select name="action" defaultValue={filters.action ?? ""} className={inputClass}>
              <option value="">Todas</option>
              <option value="create">create</option>
              <option value="update">update</option>
              <option value="delete">delete</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Actor</label>
            <select name="userId" defaultValue={filters.userId ?? ""} className={inputClass}>
              <option value="">Todos</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>ID de entidad</label>
            <input name="entityId" defaultValue={filters.entityId ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Desde</label>
            <input name="from" type="date" defaultValue={filters.from ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Hasta</label>
            <input name="to" type="date" defaultValue={filters.to ?? ""} className={inputClass} />
          </div>
          <div className="col-span-2 md:col-span-6">
            <button type="submit" className={buttonSecondaryClass}>Filtrar</button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={`Eventos (${rows.length}${rows.length === PAGE_SIZE ? `, últimos ${PAGE_SIZE}` : ""})`}
          description="La exportación CSV aplica los mismos filtros, con un límite de 5,000 filas."
        />
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<ScrollText className="size-6" />} title="Sin eventos">
              Ningún evento de auditoría coincide con los filtros.
            </EmptyState>
          </div>
        ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Actor</Th>
                  <Th>Entidad</Th>
                  <Th>Acción</Th>
                  <Th>Campo</Th>
                  <Th>Anterior</Th>
                  <Th>Nuevo</Th>
                  <Th>Origen</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-edge align-top">
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                    <Td className="text-xs">{r.actorName ?? "Sistema"}</Td>
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
