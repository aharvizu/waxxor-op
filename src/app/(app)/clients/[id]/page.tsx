import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import {
  AlertTriangle,
  Archive,
  Building2,
  CircleDollarSign,
  Clock,
  FileText,
  History,
  MessagesSquare,
  Plus,
  RefreshCw,
  Repeat,
  StickyNote,
  Ticket,
  Users,
} from "lucide-react";
import { db } from "@/db";
import { clients, services, users } from "@/db/schema";
import {
  buildClientAlerts,
  daysUntil,
  derivedContractStatus,
  derivedServiceStatus,
  describeClientAuditEvent,
  RENEWAL_BUCKET_LABELS,
  renewalBucket,
} from "@/lib/client360";
import {
  getClientAuditTrail,
  getClientContacts,
  getClientContracts,
  getClientConversations,
  getClientNotes,
  getClientProjects,
  getClientReports,
  getClientServicesList,
  getClientSummary,
  getClientTimeRollup,
  getClientWorkItems,
  getContractConsumedMinutes,
} from "@/lib/client360-data";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import {
  activityStatusMeta,
  clientServiceStatusMeta,
  clientServiceTypeMeta,
  clientStatusMeta,
  contactTypeMeta,
  contractStatusMeta,
  contractTypeMeta,
  projectHealthMeta,
  projectStatusMeta,
  recurrenceFrequencyMeta,
  recurrenceStatusMeta,
  recurrenceTargetTypeMeta,
  renewalBucketMeta,
  reportStatusMeta,
  reportTypeMeta,
  supportCoverageMeta,
  ticketBillingMeta,
  ticketPriorityMeta,
  ticketStatusMeta,
} from "@/lib/labels";
import { describeSchedule, getClientRecurrences, toSchedule } from "@/lib/recurrence-data";
import { requireUser } from "@/lib/session";
import { formatMinutes } from "@/lib/time-entries";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  THead,
  Table,
  Td,
  Th,
  buttonClass,
  buttonSecondaryClass,
  cx,
} from "@/components/ui";
import {
  ClientProfileForm,
  ClientServiceForm,
  ContactForm,
  ContractForm,
  Disclosure,
  NoteComposer,
  NoteEditor,
  RenewalInlineForm,
  RowAction,
  ServiceCatalogForm,
} from "../client360-forms";

export const metadata: Metadata = { title: "Client 360" };

const TABS = [
  ["resumen", "Resumen"],
  ["contactos", "Contactos"],
  ["servicios", "Servicios"],
  ["licenciamientos", "Licenciamientos"],
  ["contratos", "Contratos"],
  ["renovaciones", "Renovaciones"],
  ["tickets", "Tickets"],
  ["actividades", "Actividades"],
  ["proyectos", "Proyectos"],
  ["recurrentes", "Recurrentes"],
  ["conversaciones", "Conversaciones"],
  ["tiempo", "Tiempo"],
  ["cobros", "Cobros"],
  ["reportes", "Reportes"],
  ["notas", "Notas"],
  ["historial", "Historial"],
] as const;
type Tab = (typeof TABS)[number][0];

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const clientId = Number(id);
  if (!Number.isInteger(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, user.organizationId)));
  if (!client) notFound();

  const tab: Tab = TABS.some(([t]) => t === rawTab) ? (rawTab as Tab) : "resumen";
  const now = new Date();
  const canSeeTechnicalAudit = user.role === "superadmin" || user.role === "administrator";

  const [summary, servicesList, contractsList, internalUsers, clientRecurrences, clientReports] = await Promise.all([
    getClientSummary(user.organizationId, clientId),
    getClientServicesList(user.organizationId, clientId),
    getClientContracts(user.organizationId, clientId),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
    getClientRecurrences(user.organizationId, clientId),
    getClientReports(user.organizationId, clientId),
  ]);
  const recurrencesInError = clientRecurrences.filter((r) => r.def.status === "error").length;
  const reportsNeedingAttention = clientReports.filter((r) =>
    ["draft", "ready_for_review", "changes_requested", "failed"].includes(r.status) ||
    (r.status === "approved" && !r.sentAt),
  ).length;

  const renewalItems = [
    ...servicesList
      .filter((s) => s.cs.status === "active" && s.cs.renewalDate)
      .map((s) => ({
        source: "client_service" as const,
        sourceId: s.cs.id,
        concept: s.serviceName,
        kind: s.cs.serviceType,
        date: s.cs.renewalDate!,
        amount: s.cs.clientPrice,
      })),
    ...contractsList
      .filter((c) => c.status === "active" && c.endDate)
      .map((c) => ({
        source: "contract" as const,
        sourceId: c.id,
        concept: c.name,
        kind: c.contractType,
        date: c.endDate!,
        amount: c.monthlyAmount,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const alerts = buildClientAlerts({
    clientId,
    renewals: renewalItems.map((r) => ({
      source: r.source,
      sourceId: r.sourceId,
      clientId,
      clientName: client.name,
      concept: r.concept,
      kind: r.kind,
      date: r.date,
      amount: r.amount,
      ownerName: null,
      status: "active",
    })),
    overdueTickets: summary.overdueTickets,
    slaAtRisk: summary.slaAtRisk,
    unansweredConversations: summary.unansweredConversations,
    overdueActivities: summary.overdueActivities,
    billingPendingReview: summary.billingPendingReview,
    recurrencesInError,
    reportsNeedingAttention,
    lastTouchAt: summary.lastTouchAt,
    now,
  });

  return (
    <div>
      {client.status === "archived" ? (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-edge bg-subtle px-4 py-3 text-sm text-muted">
          <Archive className="size-4 shrink-0" />
          Este cliente está archivado. Los datos se conservan de solo lectura.
        </div>
      ) : null}

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={client.name} size="md" square />
            {client.name}
            <Badge tone={clientStatusMeta[client.status]?.tone ?? "slate"}>
              {clientStatusMeta[client.status]?.label ?? client.status}
            </Badge>
          </span>
        }
        subtitle={client.industry ?? client.legalName ?? undefined}
        action={
          <>
            <Link href={`/helpdesk/new?clientId=${clientId}`} className={buttonSecondaryClass}>
              <Ticket className="size-4" /> Nuevo ticket
            </Link>
            <Link href={`/activities/new?clientId=${clientId}`} className={buttonSecondaryClass}>
              <Plus className="size-4" /> Nueva actividad
            </Link>
            <Link href="/clients" className={buttonClass}>
              Volver
            </Link>
          </>
        }
      />

      {alerts.length > 0 ? (
        <div className="mb-6 space-y-2">
          {alerts.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              className={cx(
                "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors",
                a.severity === "high"
                  ? "border-red-600/20 bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-400/10 dark:text-red-300"
                  : a.severity === "medium"
                    ? "border-amber-600/20 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-300"
                    : "border-edge bg-subtle text-muted hover:bg-subtle/70",
              )}
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span className="font-medium">{a.title}</span>
              <span className="text-xs opacity-80">{a.detail}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<Ticket />} label="Tickets abiertos" value={String(summary.openTickets)} />
        <StatCard
          icon={<AlertTriangle />}
          label="Vencidos / SLA en riesgo"
          value={`${summary.overdueTickets} / ${summary.slaAtRisk}`}
        />
        <StatCard icon={<Clock />} label="Horas del mes" value={formatMinutes(summary.monthMinutes)} />
        <StatCard icon={<MessagesSquare />} label="Sin responder" value={String(summary.unansweredConversations)} />
        <StatCard icon={<Building2 />} label="Servicios activos" value={String(summary.activeServices)} />
        <StatCard icon={<RefreshCw />} label="Contratos activos" value={String(summary.activeContracts)} />
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-edge pb-px">
        {TABS.map(([key, label]) => (
          <TabLink key={key} href={`/clients/${clientId}?tab=${key}`} active={tab === key}>
            {label}
          </TabLink>
        ))}
      </div>

      {tab === "resumen" ? (
        <ResumenTab
          client={client}
          internalUsers={internalUsers}
          renewalItems={renewalItems}
          now={now}
        />
      ) : null}

      {tab === "contactos" ? <ContactosTab clientId={clientId} orgId={user.organizationId} /> : null}

      {tab === "servicios" ? (
        <ServiciosTab
          clientId={clientId}
          orgId={user.organizationId}
          servicesList={servicesList.filter((s) => s.cs.serviceType !== "license")}
          now={now}
        />
      ) : null}

      {tab === "licenciamientos" ? (
        <ServiciosTab
          clientId={clientId}
          orgId={user.organizationId}
          servicesList={servicesList.filter((s) => s.cs.serviceType === "license")}
          now={now}
          licenseMode
        />
      ) : null}

      {tab === "contratos" ? (
        <ContratosTab
          clientId={clientId}
          orgId={user.organizationId}
          contractsList={contractsList}
          now={now}
          canDelete={user.role === "superadmin"}
        />
      ) : null}

      {tab === "renovaciones" ? (
        <RenovacionesTab clientId={clientId} renewalItems={renewalItems} now={now} />
      ) : null}

      {tab === "tickets" ? <TicketsTab clientId={clientId} orgId={user.organizationId} /> : null}

      {tab === "actividades" ? <ActividadesTab clientId={clientId} orgId={user.organizationId} /> : null}

      {tab === "proyectos" ? <ProyectosTab clientId={clientId} orgId={user.organizationId} /> : null}

      {tab === "recurrentes" ? (
        <RecurrentesTab clientId={clientId} rows={clientRecurrences} now={now} />
      ) : null}

      {tab === "conversaciones" ? (
        <ConversacionesTab clientId={clientId} orgId={user.organizationId} />
      ) : null}

      {tab === "tiempo" ? <TiempoTab clientId={clientId} orgId={user.organizationId} /> : null}

      {tab === "cobros" ? <CobrosTab clientId={clientId} orgId={user.organizationId} /> : null}

      {tab === "reportes" ? <ReportesTab clientId={clientId} rows={clientReports} /> : null}

      {tab === "notas" ? (
        <NotasTab clientId={clientId} orgId={user.organizationId} currentUserId={Number(user.id)} />
      ) : null}

      {tab === "historial" ? (
        <HistorialTab clientId={clientId} orgId={user.organizationId} canSeeTechnical={canSeeTechnicalAudit} />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Resumen */

async function ResumenTab({
  client,
  internalUsers,
  renewalItems,
  now,
}: {
  client: typeof clients.$inferSelect;
  internalUsers: { id: number; name: string }[];
  renewalItems: { source: "client_service" | "contract"; sourceId: number; concept: string; date: string }[];
  now: Date;
}) {
  const nextRenewals = renewalItems.slice(0, 5);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <Card className="p-6">
          <CardHeader title="Perfil del cliente" className="mb-4 px-0 pt-0" />
          <ClientProfileForm
            client={{
              id: client.id,
              name: client.name,
              legalName: client.legalName,
              ownerName: client.ownerName,
              industry: client.industry,
              website: client.website,
              email: client.email,
              phone: client.phone,
              address: client.address,
              city: client.city,
              state: client.state,
              country: client.country,
              status: client.status,
              accountOwnerId: client.accountOwnerId,
              defaultTechnicianId: client.defaultTechnicianId,
              notes: client.notes,
            }}
            internalUsers={internalUsers}
          />
        </Card>
      </div>
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader title="Próximas renovaciones" />
          {nextRenewals.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sin renovaciones próximas.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {nextRenewals.map((r) => {
                const bucket = renewalBucket(r.date, now);
                return (
                  <li key={`${r.source}:${r.sourceId}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-fg">{r.concept}</span>
                    <Badge tone={renewalBucketMeta[bucket]?.tone ?? "slate"}>{fmtDate(r.date)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Contacts */

async function ContactosTab({ clientId, orgId }: { clientId: number; orgId: number }) {
  const contactsList = await getClientContacts(orgId, clientId);
  return (
    <div className="space-y-6">
      <Disclosure label="+ Agregar contacto">
        <ContactForm clientId={clientId} />
      </Disclosure>
      {contactsList.length === 0 ? (
        <EmptyState icon={<Users />} title="Sin contactos">
          Agrega el primer contacto de este cliente.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Nombre</Th>
                <Th>Tipo</Th>
                <Th>Email</Th>
                <Th>Teléfono</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {contactsList.map((c) => (
                <tr key={c.id} className={cx(!c.isActive && "opacity-60")}>
                  <Td>
                    <span className="flex items-center gap-2 font-medium text-fg">
                      {c.firstName} {c.lastName}
                      {c.isPrimary ? <Badge tone="blue">Principal</Badge> : null}
                    </span>
                    {c.jobTitle ? <span className="block text-xs text-muted">{c.jobTitle}</span> : null}
                  </Td>
                  <Td>
                    <Badge tone={contactTypeMeta[c.contactType]?.tone ?? "slate"}>
                      {contactTypeMeta[c.contactType]?.label ?? c.contactType}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{c.email ?? "—"}</Td>
                  <Td className="text-muted">{c.phone ?? c.mobile ?? "—"}</Td>
                  <Td>{c.isActive ? <Badge tone="green">Activo</Badge> : <Badge tone="slate">Archivado</Badge>}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      {!c.isPrimary && c.isActive ? (
                        <RowAction action="setPrimaryContact" fields={{ id: c.id }} label="Hacer principal" />
                      ) : null}
                      <RowAction
                        action="toggleContactActive"
                        fields={{ id: c.id }}
                        label={c.isActive ? "Archivar" : "Restaurar"}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {contactsList.length > 0 ? (
        <div className="space-y-3">
          {contactsList.map((c) => (
            <Disclosure key={c.id} label={`Editar: ${c.firstName} ${c.lastName}`}>
              <ContactForm
                clientId={clientId}
                contact={{
                  id: c.id,
                  firstName: c.firstName,
                  lastName: c.lastName,
                  jobTitle: c.jobTitle,
                  email: c.email,
                  phone: c.phone,
                  mobile: c.mobile,
                  whatsappNumber: c.whatsappNumber,
                  contactType: c.contactType,
                  isPrimary: c.isPrimary,
                  notes: c.notes,
                }}
              />
            </Disclosure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------- Services/Licenses */

async function ServiciosTab({
  clientId,
  orgId,
  servicesList,
  now,
  licenseMode,
}: {
  clientId: number;
  orgId: number;
  servicesList: Awaited<ReturnType<typeof getClientServicesList>>;
  now: Date;
  licenseMode?: boolean;
}) {
  const catalog = await db
    .select({ id: services.id, name: services.name })
    .from(services)
    .where(and(eq(services.organizationId, orgId), eq(services.status, "active")))
    .orderBy(asc(services.name));

  return (
    <div className="space-y-6">
      <Disclosure label={licenseMode ? "+ Agregar licenciamiento" : "+ Contratar servicio"}>
        {catalog.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Aún no hay servicios en el catálogo de la organización. Crea uno primero.
            </p>
            <ServiceCatalogForm />
          </div>
        ) : (
          <ClientServiceForm clientId={clientId} servicesCatalog={catalog} license={licenseMode} />
        )}
      </Disclosure>

      {servicesList.length === 0 ? (
        <EmptyState icon={<Building2 />} title={licenseMode ? "Sin licenciamientos" : "Sin servicios contratados"}>
          {licenseMode ? "Registra la primera licencia de este cliente." : "Registra el primer servicio contratado."}
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Servicio</Th>
                <Th>Tipo</Th>
                <Th>Estado</Th>
                <Th>Cobertura</Th>
                <Th>Proveedor</Th>
                <Th>Precio</Th>
                <Th>Renovación</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {servicesList.map(({ cs, serviceName }) => {
                const status = derivedServiceStatus(cs, now);
                return (
                  <tr key={cs.id}>
                    <Td className="font-medium text-fg">{serviceName}</Td>
                    <Td>
                      <Badge tone={clientServiceTypeMeta[cs.serviceType]?.tone ?? "slate"}>
                        {clientServiceTypeMeta[cs.serviceType]?.label ?? cs.serviceType}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={clientServiceStatusMeta[status]?.tone ?? "slate"}>
                        {clientServiceStatusMeta[status]?.label ?? status}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={supportCoverageMeta[cs.supportCoverage]?.tone ?? "slate"}>
                        {supportCoverageMeta[cs.supportCoverage]?.label ?? cs.supportCoverage}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{cs.provider ?? "—"}</Td>
                    <Td className="tabular-nums text-muted">{cs.clientPrice ? fmtMoney(cs.clientPrice) : "—"}</Td>
                    <Td className="text-muted">{cs.renewalDate ? fmtDate(cs.renewalDate) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {servicesList.length > 0 && catalog.length > 0 ? (
        <div className="space-y-3">
          {servicesList.map(({ cs, serviceName }) => (
            <Disclosure key={cs.id} label={`Editar: ${serviceName} (desde ${fmtDate(cs.startDate)})`}>
              <ClientServiceForm
                clientId={clientId}
                servicesCatalog={catalog}
                clientService={{
                  id: cs.id,
                  serviceId: cs.serviceId,
                  serviceType: cs.serviceType,
                  status: cs.status,
                  quantity: cs.quantity,
                  provider: cs.provider,
                  billingCycle: cs.billingCycle,
                  cost: cs.cost,
                  clientPrice: cs.clientPrice,
                  startDate: cs.startDate,
                  endDate: cs.endDate,
                  renewalDate: cs.renewalDate,
                  supportCoverage: cs.supportCoverage,
                  includedHours: cs.includedHours,
                  notes: cs.notes,
                }}
              />
            </Disclosure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Contracts */

async function ContratosTab({
  clientId,
  orgId,
  contractsList,
  now,
  canDelete,
}: {
  clientId: number;
  orgId: number;
  contractsList: Awaited<ReturnType<typeof getClientContracts>>;
  now: Date;
  canDelete: boolean;
}) {
  const consumed = await Promise.all(
    contractsList
      .filter((c) => c.status === "active")
      .map(async (c) => ({
        id: c.id,
        minutes: await getContractConsumedMinutes(
          orgId,
          clientId,
          c.startDate,
          now.toISOString().slice(0, 10),
        ),
      })),
  );
  const consumedById = new Map(consumed.map((c) => [c.id, c.minutes]));

  return (
    <div className="space-y-6">
      <Disclosure label="+ Registrar contrato">
        <ContractForm clientId={clientId} />
      </Disclosure>

      {contractsList.length === 0 ? (
        <EmptyState icon={<FileText />} title="Sin contratos">
          Registra el primer contrato de este cliente.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {contractsList.map((c) => {
            const status = derivedContractStatus(c, now);
            const minutes = consumedById.get(c.id);
            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-fg">{c.name}</p>
                    <p className="text-xs text-muted">
                      {contractTypeMeta[c.contractType]?.label ?? c.contractType}
                    </p>
                  </div>
                  <Badge tone={contractStatusMeta[status]?.tone ?? "slate"}>
                    {contractStatusMeta[status]?.label ?? status}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Vigencia</dt>
                    <dd className="text-fg">
                      {fmtDate(c.startDate)} – {c.endDate ? fmtDate(c.endDate) : "indefinido"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Monto mensual</dt>
                    <dd className="text-fg">{c.monthlyAmount ? fmtMoney(c.monthlyAmount) : "—"}</dd>
                  </div>
                  {c.includedHours != null ? (
                    <div>
                      <dt className="text-xs text-muted">Horas incluidas</dt>
                      <dd className="text-fg">
                        {minutes != null ? formatMinutes(minutes) : "—"} / {c.includedHours}h
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs text-muted">Renovación automática</dt>
                    <dd className="text-fg">{c.autoRenew ? "Sí" : "No"}</dd>
                  </div>
                </dl>
                <div className="mt-3 space-y-3 border-t border-edge pt-3">
                  <Disclosure label="Editar contrato">
                    <ContractForm
                      clientId={clientId}
                      contract={{
                        id: c.id,
                        name: c.name,
                        contractType: c.contractType,
                        status: c.status,
                        startDate: c.startDate,
                        endDate: c.endDate,
                        autoRenew: c.autoRenew,
                        includedHours: c.includedHours,
                        monthlyAmount: c.monthlyAmount,
                        notes: c.notes,
                      }}
                    />
                  </Disclosure>
                  {canDelete ? (
                    <RowAction
                      action="deleteContract"
                      fields={{ id: c.id }}
                      label="Eliminar"
                      confirm={`¿Eliminar el contrato "${c.name}" permanentemente?`}
                      danger
                    />
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Renewals */

async function RenovacionesTab({
  clientId,
  renewalItems,
  now,
}: {
  clientId: number;
  renewalItems: { source: "client_service" | "contract"; sourceId: number; concept: string; kind: string; date: string; amount: string | null }[];
  now: Date;
}) {
  if (renewalItems.length === 0) {
    return (
      <EmptyState icon={<RefreshCw />} title="Sin renovaciones">
        No hay servicios, licencias ni contratos con fecha de renovación registrada.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Concepto</Th>
            <Th>Tipo</Th>
            <Th>Vence</Th>
            <Th>Umbral</Th>
            <Th>Monto</Th>
            <Th>Actualizar</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {renewalItems.map((r) => {
            const bucket = renewalBucket(r.date, now);
            const days = daysUntil(r.date, now);
            return (
              <tr key={`${r.source}:${r.sourceId}`}>
                <Td className="font-medium text-fg">{r.concept}</Td>
                <Td className="text-muted">{r.kind}</Td>
                <Td className="tabular-nums text-muted">
                  {fmtDate(r.date)} ({days < 0 ? `${Math.abs(days)}d vencido` : `${days}d`})
                </Td>
                <Td>
                  <Badge tone={renewalBucketMeta[bucket]?.tone ?? "slate"}>{RENEWAL_BUCKET_LABELS[bucket]}</Badge>
                </Td>
                <Td className="tabular-nums text-muted">{r.amount ? fmtMoney(r.amount) : "—"}</Td>
                <Td>
                  <RenewalInlineForm
                    source={r.source}
                    sourceId={r.sourceId}
                    clientId={clientId}
                    currentDate={r.date}
                  />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

/* ----------------------------------------------------------------- Tickets */

async function TicketsTab({ clientId, orgId }: { clientId: number; orgId: number }) {
  const rows = await getClientWorkItems(orgId, clientId, "ticket");
  if (rows.length === 0) {
    return (
      <EmptyState icon={<Ticket />} title="Sin tickets">
        Este cliente no tiene tickets registrados todavía.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Folio</Th>
            <Th>Título</Th>
            <Th>Estado</Th>
            <Th>Prioridad</Th>
            <Th>Asignado</Th>
            <Th>Tiempo</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map((t) => (
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
              <Td className="text-muted">{t.assigneeName ?? "—"}</Td>
              <Td className="tabular-nums text-muted">{formatMinutes(t.minutes)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* -------------------------------------------------------------- Activities */

async function ActividadesTab({ clientId, orgId }: { clientId: number; orgId: number }) {
  const rows = await getClientWorkItems(orgId, clientId, "activity");
  if (rows.length === 0) {
    return (
      <EmptyState icon={<Plus />} title="Sin actividades">
        Este cliente no tiene actividades registradas todavía.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Título</Th>
            <Th>Estado</Th>
            <Th>Prioridad</Th>
            <Th>Vence</Th>
            <Th>Tiempo</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map((a) => (
            <tr key={a.workItemId} className="transition-colors hover:bg-subtle">
              <Td>
                <Link href={`/activities/${a.id}`} className="font-medium text-fg hover:text-primary">
                  {a.title}
                </Link>
                {a.parentTicketId ? <span className="ml-2 text-xs text-muted">(de un ticket)</span> : null}
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
              <Td className="text-muted">{a.dueDate ? fmtDate(a.dueDate) : "—"}</Td>
              <Td className="tabular-nums text-muted">{formatMinutes(a.minutes)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ----------------------------------------------------------------- Projects */

async function ProyectosTab({ clientId, orgId }: { clientId: number; orgId: number }) {
  const rows = await getClientProjects(orgId, clientId);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Building2 />}
        title="Sin proyectos"
        action={
          <Link href={`/projects/new?clientId=${clientId}`} className={buttonSecondaryClass}>
            Crear proyecto
          </Link>
        }
      >
        Este cliente no tiene proyectos registrados todavía.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/projects/new?clientId=${clientId}`} className={buttonSecondaryClass}>
          Crear proyecto
        </Link>
      </div>
      <Card className="overflow-visible">
        <Table>
          <THead>
            <tr>
              <Th>Proyecto</Th>
              <Th>Estado</Th>
              <Th>Salud</Th>
              <Th>PM</Th>
              <Th>Avance</Th>
              <Th>Objetivo</Th>
              <Th>Tiempo</Th>
              <Th>Próximo hito</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge">
            {rows.map((p) => {
              const percent =
                p.totalActivities === 0
                  ? 0
                  : Math.round((p.completedActivities / p.totalActivities) * 100);
              return (
                <tr key={p.id} className="transition-colors hover:bg-subtle">
                  <Td>
                    <Link href={`/projects/${p.id}`} className="font-medium text-fg hover:text-primary">
                      {p.folio} · {p.name}
                    </Link>
                    {p.openHighRisks > 0 ? (
                      <Badge tone="red" className="ml-2">
                        {p.openHighRisks} riesgo(s)
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={projectStatusMeta[p.status]?.tone ?? "slate"}>
                      {projectStatusMeta[p.status]?.label ?? p.status}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={projectHealthMeta[p.healthStatus]?.tone ?? "slate"}>
                      {projectHealthMeta[p.healthStatus]?.label ?? p.healthStatus}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{p.managerName ?? "—"}</Td>
                  <Td className="tabular-nums text-muted">
                    {percent}% ({p.completedActivities}/{p.totalActivities})
                  </Td>
                  <Td className="text-muted">{p.targetDate ? fmtDate(p.targetDate) : "—"}</Td>
                  <Td className="tabular-nums text-muted">{formatMinutes(p.loggedMinutes)}</Td>
                  <Td className="text-muted">{p.nextMilestone ?? "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- Recurring */

async function RecurrentesTab({
  clientId,
  rows,
  now,
}: {
  clientId: number;
  rows: Awaited<ReturnType<typeof getClientRecurrences>>;
  now: Date;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Repeat />}
        title="Sin recurrencias"
        action={
          <Link href={`/recurring/new?clientId=${clientId}`} className={buttonSecondaryClass}>
            Crear recurrencia
          </Link>
        }
      >
        Este cliente no tiene trabajo recurrente automatizado todavía.
      </EmptyState>
    );
  }
  const nowMs = now.getTime();
  const active = rows.filter((r) => r.def.status === "active").length;
  const paused = rows.filter((r) => r.def.status === "paused").length;
  const inError = rows.filter((r) => r.def.status === "error").length;
  const in30Days = rows.filter(
    (r) => r.def.nextRunAt && r.def.nextRunAt.getTime() > nowMs && r.def.nextRunAt.getTime() - nowMs < 30 * 86_400_000,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full border border-edge px-2.5 py-1">{active} activa(s)</span>
          <span className="rounded-full border border-edge px-2.5 py-1">{paused} pausada(s)</span>
          {inError > 0 ? <span className="rounded-full border border-danger/30 bg-danger-soft px-2.5 py-1 text-danger">{inError} con error</span> : null}
          <span className="rounded-full border border-edge px-2.5 py-1">{in30Days} en 30 días</span>
        </div>
        <Link href={`/recurring/new?clientId=${clientId}`} className={buttonSecondaryClass}>
          Crear recurrencia
        </Link>
      </div>
      <Card className="overflow-visible">
        <Table>
          <THead>
            <tr>
              <Th>Nombre</Th>
              <Th>Tipo</Th>
              <Th>Frecuencia</Th>
              <Th>Responsable</Th>
              <Th>Próxima ejecución</Th>
              <Th>Estado</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge">
            {rows.map(({ def, assigneeName }) => (
              <tr key={def.id} className="transition-colors hover:bg-subtle">
                <Td>
                  <Link href={`/recurring/${def.id}`} className="font-medium text-fg hover:text-primary">
                    {def.name}
                  </Link>
                  <span className="block text-xs text-muted">{describeSchedule(toSchedule(def))}</span>
                </Td>
                <Td>
                  <Badge tone={recurrenceTargetTypeMeta[def.targetType]?.tone ?? "slate"}>
                    {recurrenceTargetTypeMeta[def.targetType]?.label ?? def.targetType}
                  </Badge>
                </Td>
                <Td className="text-muted">{recurrenceFrequencyMeta[def.frequency]?.label ?? def.frequency}</Td>
                <Td className="text-muted">{assigneeName ?? "—"}</Td>
                <Td className="text-muted">{def.nextRunAt ? fmtDateTime(def.nextRunAt) : "—"}</Td>
                <Td>
                  <Badge tone={recurrenceStatusMeta[def.status]?.tone ?? "slate"}>
                    {recurrenceStatusMeta[def.status]?.label ?? def.status}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Conversations */

async function ConversacionesTab({ clientId, orgId }: { clientId: number; orgId: number }) {
  const rows = await getClientConversations(orgId, clientId);
  const inboxActions = (
    <div className="flex gap-2">
      <Link href={`/inbox?clientId=${clientId}`} className={cx(buttonSecondaryClass, "h-8 text-xs")}>
        Abrir en Inbox
      </Link>
      <Link href={`/inbox?clientId=${clientId}&new=1`} className={cx(buttonSecondaryClass, "h-8 text-xs")}>
        Nueva conversación
      </Link>
    </div>
  );
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {inboxActions}
        <EmptyState icon={<MessagesSquare />} title="Sin conversaciones">
          Este cliente no tiene conversaciones registradas todavía.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {inboxActions}
      <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((c) => (
          <li key={c.conversationId} className="px-5 py-3.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={c.ticketId ? `/helpdesk/${c.ticketId}?tab=conversation` : `/inbox?c=${c.conversationId}`}
                className="font-medium text-fg hover:text-primary"
              >
                {c.ticketId ? `${c.folio} · ${c.title}` : (c.subject ?? `Conversación #${c.conversationId}`)}
              </Link>
              <span className="shrink-0 text-xs text-faint tabular-nums">
                {c.occurredAt ? fmtDateTime(c.occurredAt) : "—"}
              </span>
            </div>
            <p className="mt-1 truncate text-muted">
              {c.direction === "inbound" ? "Cliente: " : "Nosotros: "}
              {c.body ?? "—"}
            </p>
          </li>
        ))}
      </ul>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------- Time */

async function TiempoTab({ clientId, orgId }: { clientId: number; orgId: number }) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const rollup = await getClientTimeRollup(orgId, clientId, from, to);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Clock />} label="Total del mes" value={formatMinutes(rollup.totals.total)} />
        <StatCard icon={<CircleDollarSign />} label="Facturable" value={formatMinutes(rollup.totals.billable)} />
        <StatCard icon={<RefreshCw />} label="Incluido en contrato" value={formatMinutes(rollup.totals.inContract)} />
        <StatCard icon={<AlertTriangle />} label="Por revisar" value={formatMinutes(rollup.totals.pendingReview)} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Por técnico" />
        {rollup.byUser.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Sin tiempo registrado este mes.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {rollup.byUser.map((u) => (
              <li key={u.name ?? "—"} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-fg">{u.name ?? "—"}</span>
                <span className="tabular-nums text-muted">{formatMinutes(u.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Top ítems de trabajo" />
        {rollup.byItem.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Sin tiempo registrado este mes.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {rollup.byItem.map((i, idx) => (
              <li key={idx} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="truncate text-fg">{i.title}</span>
                <span className="shrink-0 tabular-nums text-muted">{formatMinutes(i.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Billing */

async function CobrosTab({ clientId, orgId }: { clientId: number; orgId: number }) {
  const rows = (await getClientWorkItems(orgId, clientId, "ticket")).filter((t) => t.billingStatus);
  if (rows.length === 0) {
    return (
      <EmptyState icon={<CircleDollarSign />} title="Sin cobros">
        No hay tickets con clasificación de cobro para este cliente.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Folio</Th>
            <Th>Título</Th>
            <Th>Cobro</Th>
            <Th>Modalidad</Th>
            <Th>Monto</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map((t) => (
            <tr key={t.workItemId}>
              <Td>
                <Link href={`/helpdesk/${t.id}?tab=resolution`} className="font-medium text-fg hover:text-primary">
                  {t.folio}
                </Link>
              </Td>
              <Td className="max-w-xs truncate text-muted">{t.title}</Td>
              <Td>
                <Badge tone={ticketBillingMeta[t.billingStatus!]?.tone ?? "slate"}>
                  {ticketBillingMeta[t.billingStatus!]?.label ?? t.billingStatus}
                </Badge>
              </Td>
              <Td className="text-muted">{t.billingModality ?? "—"}</Td>
              <Td className="tabular-nums text-muted">{t.calculatedAmount ? fmtMoney(t.calculatedAmount) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ----------------------------------------------------------------- Reports */

async function ReportesTab({
  clientId,
  rows,
}: {
  clientId: number;
  rows: Awaited<ReturnType<typeof getClientReports>>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText />}
        title="Sin reportes"
        action={
          <div className="flex gap-2">
            <Link href={`/reports/new?clientId=${clientId}`} className={buttonSecondaryClass}>
              Crear reporte
            </Link>
            <Link href={`/recurring/new?targetType=report&clientId=${clientId}`} className={buttonSecondaryClass}>
              Programar reporte mensual
            </Link>
          </div>
        }
      >
        Este cliente no tiene reportes registrados todavía.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Link href={`/recurring/new?targetType=report&clientId=${clientId}`} className={buttonSecondaryClass}>
          Programar recurrente
        </Link>
        <Link href={`/reports/new?clientId=${clientId}`} className={buttonSecondaryClass}>
          Crear reporte
        </Link>
      </div>
      <Card className="overflow-visible">
        <Table>
          <THead>
            <tr>
              <Th>Reporte</Th>
              <Th>Tipo</Th>
              <Th>Periodo</Th>
              <Th>Versión</Th>
              <Th>Estado</Th>
              <Th>Enviado</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge">
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-subtle">
                <Td>
                  <Link href={`/reports/${r.id}`} className="font-medium text-fg hover:text-primary">
                    {r.title}
                  </Link>
                </Td>
                <Td>
                  <Badge tone={reportTypeMeta[r.reportType]?.tone ?? "slate"}>
                    {reportTypeMeta[r.reportType]?.label ?? r.reportType}
                  </Badge>
                </Td>
                <Td className="text-muted tabular-nums">
                  {r.periodStart ? `${r.periodStart} – ${r.periodEnd}` : "—"}
                </Td>
                <Td className="tabular-nums text-muted">v{r.version}</Td>
                <Td>
                  <Badge tone={reportStatusMeta[r.status]?.tone ?? "slate"}>
                    {reportStatusMeta[r.status]?.label ?? r.status}
                  </Badge>
                </Td>
                <Td className="text-muted">{r.sentAt ? fmtDate(r.sentAt) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------- Notes */

async function NotasTab({
  clientId,
  orgId,
  currentUserId,
}: {
  clientId: number;
  orgId: number;
  currentUserId: number;
}) {
  const rows = await getClientNotes(orgId, clientId);
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <CardHeader title="Nueva nota" className="mb-3 px-0 pt-0" />
        <NoteComposer clientId={clientId} />
      </Card>
      {rows.length === 0 ? (
        <EmptyState icon={<StickyNote />} title="Sin notas">
          Todavía no hay notas para este cliente.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ note, authorName }) => (
            <Card key={note.id} className="p-4">
              <div className="flex items-center justify-between gap-3 text-xs text-faint">
                <span>
                  {authorName ?? "—"} · {fmtDateTime(note.createdAt)}
                  {note.editedAt ? " · editada" : ""}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{note.body}</p>
              {note.authorId === currentUserId ? (
                <NoteEditor clientId={clientId} noteId={note.id} body={note.body} />
              ) : null}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- History */

async function HistorialTab({
  clientId,
  orgId,
  canSeeTechnical,
}: {
  clientId: number;
  orgId: number;
  canSeeTechnical: boolean;
}) {
  const rows = await getClientAuditTrail(orgId, clientId);
  if (rows.length === 0) {
    return (
      <EmptyState icon={<History />} title="Sin historial">
        No hay eventos registrados para este cliente todavía.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader title="Historial" description="Qué ha pasado con este cliente, en lenguaje simple." />
        <ul className="divide-y divide-edge">
          {rows.map(({ log, actorName }) => (
            <li key={log.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="text-fg">{describeClientAuditEvent(log)}</span>
              <span className="shrink-0 text-xs text-faint tabular-nums">
                {actorName ?? "sistema"} · {fmtDateTime(log.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {canSeeTechnical ? (
        <Card className="overflow-hidden">
          <CardHeader title="Registro técnico" description="AuditLog — SuperAdmin / Administrator." />
          <ul className="divide-y divide-edge">
            {rows.map(({ log, actorName }) => (
              <li key={log.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-fg">
                    {log.entityType}.{log.field ?? log.action}
                  </span>{" "}
                  <span className="text-muted">
                    {log.field ? `${log.oldValue ?? "—"} → ${log.newValue ?? "—"}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-faint tabular-nums">
                  {actorName ?? "system"} · {fmtDateTime(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
