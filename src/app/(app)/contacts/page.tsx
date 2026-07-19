import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Users } from "lucide-react";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getContactsDirectory } from "@/lib/contact360-data";
import { contactTypeMeta } from "@/lib/labels";
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
import { ContactCreateForm } from "./contact-form";

export const metadata: Metadata = { title: "Contactos" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; companyId?: string; status?: string }>;
}) {
  const user = await requireUser();
  const { q, companyId, status } = await searchParams;
  const companyIdNum = companyId ? Number(companyId) : undefined;

  const [rows, companyOptions] = await Promise.all([
    getContactsDirectory(user.organizationId, { q, companyId: companyIdNum, status }),
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.organizationId, user.organizationId))
      .orderBy(asc(companies.name)),
  ]);

  return (
    <div>
      <PageHeader title="Contactos" subtitle="Personas de contacto en cada empresa." />

      <form method="get" className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre, correo, teléfono, empresa…"
          className={cx(inputClass, "max-w-sm")}
        />
        <select name="companyId" defaultValue={companyId ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Todas las empresas</option>
          {companyOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Archivado</option>
        </select>
        <button type="submit" className={buttonSecondaryClass}>
          Buscar
        </button>
      </form>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          {rows.length === 0 ? (
            <EmptyState icon={<Users />} title="No se encontraron contactos">
              Prueba otra búsqueda, o agrega tu primer contacto a la derecha.
            </EmptyState>
          ) : (
            <Card className="overflow-visible">
              <Table>
                <THead>
                  <tr>
                    <Th>Contacto</Th>
                    <Th>Empresa</Th>
                    <Th>Tipo</Th>
                    <Th>Correo</Th>
                    <Th>Teléfono</Th>
                    <Th>Tickets abiertos</Th>
                    <Th>Estado</Th>
                  </tr>
                </THead>
                <tbody className="divide-y divide-edge">
                  {rows.map((c) => (
                    <tr key={c.id} className={cx("group transition-colors hover:bg-subtle", !c.isActive && "opacity-60")}>
                      <Td>
                        <Link
                          href={`/contacts/${c.id}`}
                          className="flex items-center gap-3 font-medium text-fg transition-colors group-hover:text-primary"
                        >
                          <Avatar name={`${c.firstName} ${c.lastName}`} size="sm" />
                          <span>
                            {c.firstName} {c.lastName}
                            {c.isPrimary ? <Badge tone="blue" className="ml-2">Principal</Badge> : null}
                          </span>
                        </Link>
                        {c.jobTitle || c.department ? (
                          <span className="block pl-11 text-xs text-muted">
                            {[c.jobTitle, c.department].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <Link href={`/companies/${c.companyId}`} className="text-muted hover:text-primary hover:underline">
                          {c.companyName}
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone={contactTypeMeta[c.contactType]?.tone ?? "slate"}>
                          {contactTypeMeta[c.contactType]?.label ?? c.contactType}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{c.email ?? "—"}</Td>
                      <Td className="text-muted">{c.phone ?? c.mobile ?? "—"}</Td>
                      <Td className={cx("tabular-nums", c.openTickets > 0 ? "text-fg" : "text-muted")}>
                        {c.openTickets}
                      </Td>
                      <Td>
                        {c.isActive ? <Badge tone="green">Activo</Badge> : <Badge tone="slate">Archivado</Badge>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="Agregar contacto" description="Una nueva persona de contacto." />
          <div className="p-5">
            <ContactCreateForm companies={companyOptions} />
          </div>
        </Card>
      </div>
    </div>
  );
}
