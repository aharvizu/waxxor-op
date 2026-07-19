import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardCheck,
  History,
  MessagesSquare,
  Ticket,
} from "lucide-react";
import {
  getCompanyContactsExcluding,
  getContactAuditTrail,
  getContactConversations,
  getContactSummary,
  getContactWorkItems,
} from "@/lib/contact360-data";
import { describeClientAuditEvent } from "@/lib/company360";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  activityStatusMeta,
  companyStatusMeta,
  contactTypeMeta,
  ticketPriorityMeta,
  ticketStatusMeta,
} from "@/lib/labels";
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
  cx,
} from "@/components/ui";
import { ContactForm, Disclosure, RowAction } from "../../companies/company360-forms";

export const metadata: Metadata = { title: "Contacto 360" };

export default async function Contact360Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) notFound();

  const summary = await getContactSummary(user.organizationId, contactId);
  if (!summary) notFound();
  const { contact, companyId, companyName, companyStatus } = summary;

  const [tickets, activities, conversations, history, siblings] = await Promise.all([
    getContactWorkItems(user.organizationId, contactId, "ticket"),
    getContactWorkItems(user.organizationId, contactId, "activity"),
    getContactConversations(user.organizationId, contactId),
    getContactAuditTrail(user.organizationId, contactId),
    getCompanyContactsExcluding(user.organizationId, companyId, contactId),
  ]);

  return (
    <div>
      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        subtitle={contact.jobTitle ?? undefined}
        action={
          <span className="flex items-center gap-2">
            {contact.isPrimary ? <Badge tone="blue">Principal</Badge> : null}
            <Badge tone={contactTypeMeta[contact.contactType]?.tone ?? "slate"}>
              {contactTypeMeta[contact.contactType]?.label ?? contact.contactType}
            </Badge>
            {contact.isActive ? <Badge tone="green">Activo</Badge> : <Badge tone="slate">Archivado</Badge>}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader title="Datos personales" />
            <dl className="grid grid-cols-1 gap-4 p-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Departamento</dt>
                <dd className="text-fg">{contact.department ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Correo</dt>
                <dd className="text-fg">{contact.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Teléfono</dt>
                <dd className="text-fg">{contact.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Celular</dt>
                <dd className="text-fg">{contact.mobile ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">WhatsApp</dt>
                <dd className="text-fg">{contact.whatsappNumber ?? "—"}</dd>
              </div>
              {contact.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">Notas</dt>
                  <dd className="whitespace-pre-wrap text-fg">{contact.notes}</dd>
                </div>
              ) : null}
            </dl>
            <div className="border-t border-edge p-5">
              <Disclosure label="Editar contacto">
                <ContactForm
                  companyId={companyId}
                  contact={{
                    id: contact.id,
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    jobTitle: contact.jobTitle,
                    department: contact.department,
                    email: contact.email,
                    phone: contact.phone,
                    mobile: contact.mobile,
                    whatsappNumber: contact.whatsappNumber,
                    contactType: contact.contactType,
                    isPrimary: contact.isPrimary,
                    notes: contact.notes,
                  }}
                />
              </Disclosure>
            </div>
            <div className="flex items-center gap-1 border-t border-edge px-5 py-3">
              {!contact.isPrimary && contact.isActive ? (
                <RowAction action="setPrimaryContact" fields={{ id: contact.id }} label="Hacer principal" />
              ) : null}
              <RowAction
                action="toggleContactActive"
                fields={{ id: contact.id }}
                label={contact.isActive ? "Archivar" : "Restaurar"}
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Tickets relacionados" description={`${tickets.length} en total`} />
            {tickets.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={<Ticket />} title="Sin tickets">
                  Este contacto no tiene tickets registrados todavía.
                </EmptyState>
              </div>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Folio</Th>
                    <Th>Título</Th>
                    <Th>Estado</Th>
                    <Th>Prioridad</Th>
                  </tr>
                </THead>
                <tbody className="divide-y divide-edge">
                  {tickets.map((t) => (
                    <tr key={t.workItemId} className="transition-colors hover:bg-subtle">
                      <Td>
                        <Link href={`/helpdesk/${t.id}`} className="font-medium text-fg hover:text-primary">
                          {t.folio}
                        </Link>
                      </Td>
                      <Td className="max-w-xs truncate text-muted">{t.title}</Td>
                      <Td>
                        <Badge tone={ticketStatusMeta[t.status]?.tone ?? "slate"}>
                          {ticketStatusMeta[t.status]?.label ?? t.status}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={ticketPriorityMeta[t.priority]?.tone ?? "slate"}>
                          {ticketPriorityMeta[t.priority]?.label ?? t.priority}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Actividades asignadas" description={`${activities.length} en total`} />
            {activities.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={<ClipboardCheck />} title="Sin actividades">
                  Este contacto no tiene actividades registradas todavía.
                </EmptyState>
              </div>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Título</Th>
                    <Th>Estado</Th>
                    <Th>Prioridad</Th>
                    <Th>Vence</Th>
                  </tr>
                </THead>
                <tbody className="divide-y divide-edge">
                  {activities.map((a) => (
                    <tr key={a.workItemId} className="transition-colors hover:bg-subtle">
                      <Td>
                        <Link href={`/activities/${a.id}`} className="font-medium text-fg hover:text-primary">
                          {a.title}
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone={activityStatusMeta[a.status]?.tone ?? "slate"}>
                          {activityStatusMeta[a.status]?.label ?? a.status}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={ticketPriorityMeta[a.priority]?.tone ?? "slate"}>
                          {ticketPriorityMeta[a.priority]?.label ?? a.priority}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{fmtDate(a.dueDate)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Conversaciones" description={`${conversations.length} en total`} />
            {conversations.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={<MessagesSquare />} title="Sin conversaciones">
                  Este contacto no tiene conversaciones registradas todavía.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-edge">
                {conversations.map((c) => (
                  <li key={c.conversationId} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-fg">
                        {c.folio ? (
                          <Link href={`/helpdesk/${c.ticketId}`} className="hover:text-primary">
                            {c.folio}
                          </Link>
                        ) : (
                          c.subject ?? "Conversación"
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-faint">
                        {c.occurredAt ? fmtDateTime(c.occurredAt) : "—"}
                      </span>
                    </div>
                    {c.body ? <p className="mt-1 truncate text-muted">{c.body}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Historial" />
            {history.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={<History />} title="Sin historial">
                  No hay eventos registrados para este contacto todavía.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-edge">
                {history.map(({ log, actorName }) => (
                  <li key={log.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="text-fg">{describeClientAuditEvent(log)}</span>
                    <span className="shrink-0 text-xs text-faint tabular-nums">
                      {actorName ?? "sistema"} · {fmtDateTime(log.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <CardHeader title="Empresa principal" className="mb-3 px-0 pt-0" />
            <Link
              href={`/companies/${companyId}`}
              className="flex items-center gap-3 rounded-lg border border-edge p-3 transition-colors hover:border-edge-strong hover:bg-subtle"
            >
              <Avatar name={companyName} size="sm" square />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-fg">{companyName}</span>
                <Badge tone={companyStatusMeta[companyStatus]?.tone ?? "slate"} className="mt-1">
                  {companyStatusMeta[companyStatus]?.label ?? companyStatus}
                </Badge>
              </span>
            </Link>
          </Card>

          {siblings.length > 0 ? (
            <Card className="p-5">
              <CardHeader title="Otros contactos de la empresa" className="mb-3 px-0 pt-0" />
              <ul className="space-y-2">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/contacts/${s.id}`}
                      className={cx(
                        "flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-fg",
                      )}
                    >
                      <span>{s.firstName} {s.lastName}</span>
                      {s.jobTitle ? <span className="text-xs text-faint">{s.jobTitle}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
