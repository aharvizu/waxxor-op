import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { AtSign, Inbox as InboxIcon, MessageSquare } from "lucide-react";
import { db } from "@/db";
import { companies, projects, users } from "@/db/schema";
import { conversationStatusMeta } from "@/lib/conversations";
import { fmtDateTime } from "@/lib/format";
import {
  INBOX_VIEWS,
  getConversationDetail,
  listConversations,
  type InboxView,
} from "@/lib/inbox-data";
import { requireUser } from "@/lib/session";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  buttonClass,
  cx,
  inputClass,
} from "@/components/ui";
import {
  AddParticipantForm,
  AutoMarkRead,
  Composer,
  ConversationControls,
  LinkConversationForm,
  MessageActions,
  NewConversationForm,
  StatusSelectForm,
} from "./inbox-forms";

export const metadata: Metadata = { title: "Inbox" };

const VIEW_LABELS: Record<InboxView, string> = {
  all: "Todas",
  unread: "No leídas",
  mine: "Mías",
  pinned: "Fijadas",
  favorites: "Favoritas",
  mentions: "Menciones",
  no_reply: "Sin respuesta",
  archived: "Archivadas",
};

type Search = {
  view?: string;
  status?: string;
  channel?: string;
  companyId?: string;
  projectId?: string;
  workItemId?: string;
  ticketId?: string;
  q?: string;
  c?: string;
  new?: string;
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const view = (INBOX_VIEWS as readonly string[]).includes(params.view ?? "")
    ? (params.view as InboxView)
    : "all";
  const selectedId = params.c ? Number(params.c) : null;

  const num = (v?: string) => (v && Number.isInteger(Number(v)) ? Number(v) : undefined);
  const filters = {
    view,
    status: params.status || undefined,
    channel: params.channel || undefined,
    companyId: num(params.companyId),
    projectId: num(params.projectId),
    workItemId: num(params.workItemId),
    ticketId: num(params.ticketId),
    q: params.q?.trim() || undefined,
  };

  const [rows, companyRows, projectRows, internalUsers, detail] = await Promise.all([
    listConversations(user.organizationId, Number(user.id), filters),
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.organizationId, user.organizationId), ne(companies.status, "archived")))
      .orderBy(asc(companies.name)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.organizationId, user.organizationId), ne(projects.status, "archived")))
      .orderBy(asc(projects.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(
          eq(users.organizationId, user.organizationId),
          ne(users.role, "client"),
          eq(users.isActive, true),
        ),
      )
      .orderBy(asc(users.name)),
    selectedId
      ? getConversationDetail(user.organizationId, Number(user.id), selectedId)
      : Promise.resolve(null),
  ]);

  const baseQuery = new URLSearchParams(
    Object.entries(params).filter(([k, v]) => k !== "c" && k !== "new" && typeof v === "string" && v !== "") as [string, string][],
  );
  const href = (extra: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams(baseQuery);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") q.delete(k);
      else q.set(k, String(v));
    }
    const qs = q.toString();
    return `/inbox${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Inbox"
        subtitle="Todas las conversaciones de tickets, clientes, actividades y proyectos en un solo lugar."
        action={
          <Link href={href({ new: "1", c: undefined })} className={buttonClass}>
            Nueva conversación
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        {/* -------------------------------------------------- list pane */}
        <div className="space-y-3">
          <form method="get" className="flex gap-2">
            {params.view ? <input type="hidden" name="view" value={params.view} /> : null}
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Buscar en asuntos, clientes, folios y mensajes…"
              className={inputClass}
            />
          </form>
          <div className="flex flex-wrap gap-1 text-xs">
            {INBOX_VIEWS.map((v) => (
              <Link
                key={v}
                href={href({ view: v === "all" ? undefined : v, c: selectedId ?? undefined })}
                className={cx(
                  "rounded-full border px-2.5 py-1 transition-colors",
                  view === v
                    ? "border-primary bg-primary-soft font-medium text-primary"
                    : "border-edge text-muted hover:text-fg",
                )}
              >
                {VIEW_LABELS[v]}
              </Link>
            ))}
          </div>
          <form method="get" className="grid grid-cols-2 gap-2">
            {params.view ? <input type="hidden" name="view" value={params.view} /> : null}
            {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
            <select name="status" defaultValue={params.status ?? ""} className={cx(inputClass, "h-8 text-xs")}>
              <option value="">Estado: todos</option>
              <option value="open">Abiertas</option>
              <option value="pending">Pendientes</option>
              <option value="closed">Cerradas</option>
            </select>
            <select name="companyId" defaultValue={params.companyId ?? ""} className={cx(inputClass, "h-8 text-xs")}>
              <option value="">Empresa: todas</option>
              {companyRows.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="submit" className="col-span-2 h-8 rounded-lg border border-edge text-xs text-muted hover:text-fg">
              Aplicar filtros
            </button>
          </form>

          <Card className="divide-y divide-edge overflow-hidden p-0">
            {rows.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={<InboxIcon className="size-6" />} title="Sin conversaciones">
                  Nada por aquí con los filtros actuales.
                </EmptyState>
              </div>
            ) : (
              rows.map((r) => {
                const title =
                  r.subject ??
                  (r.ticketFolio ? `${r.ticketFolio} · ${r.ticketTitle ?? ""}` : null) ??
                  r.companyName ??
                  r.projectName ??
                  `Conversación #${r.id}`;
                const unread = Number(r.unreadCount) > 0;
                return (
                  <Link
                    key={r.id}
                    href={href({ c: r.id })}
                    className={cx(
                      "block px-4 py-3 transition-colors hover:bg-subtle",
                      selectedId === r.id && "bg-subtle",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={cx("truncate text-sm", unread ? "font-semibold text-fg" : "text-fg")}>
                        {r.pinnedAt ? "📌 " : ""}
                        {r.favoriteAt ? "★ " : ""}
                        {title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {Number(r.unreadMentions) > 0 ? (
                          <span className="flex items-center gap-0.5 rounded-full bg-primary-soft px-1.5 text-[11px] font-medium text-primary">
                            <AtSign className="size-3" aria-hidden />
                            {r.unreadMentions}
                          </span>
                        ) : null}
                        {unread ? (
                          <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-white">
                            {r.unreadCount}
                          </span>
                        ) : null}
                        <Badge tone={conversationStatusMeta[r.status]?.tone ?? "slate"}>
                          {conversationStatusMeta[r.status]?.label ?? r.status}
                        </Badge>
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {r.lastDeletedAt
                        ? "Mensaje eliminado"
                        : (r.lastBody ?? "Sin mensajes todavía")}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-faint">
                      {r.companyName ? `${r.companyName} · ` : ""}
                      {r.lastAt ? fmtDateTime(r.lastAt) : fmtDateTime(r.updatedAt)}
                    </span>
                  </Link>
                );
              })
            )}
          </Card>
        </div>

        {/* -------------------------------------------------- detail pane */}
        <div className="min-w-0">
          {params.new ? (
            <Card className="max-w-2xl p-5">
              <h2 className="mb-4 text-sm font-semibold text-fg">Nueva conversación</h2>
              <NewConversationForm
                companies={companyRows}
                projects={projectRows}
                prefill={{
                  companyId: filters.companyId,
                  projectId: filters.projectId,
                  workItemId: filters.workItemId,
                  ticketId: filters.ticketId,
                }}
              />
            </Card>
          ) : !detail ? (
            <Card className="p-10">
              <EmptyState icon={<MessageSquare className="size-6" />} title="Selecciona una conversación">
                Elige una conversación de la lista o crea una nueva.
              </EmptyState>
            </Card>
          ) : (
            <ConversationPane
              detail={detail}
              userId={Number(user.id)}
              companies={companyRows}
              projects={projectRows}
              internalUsers={internalUsers}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ chat pane */

function ConversationPane({
  detail,
  userId,
  companies: companyRows,
  projects: projectRows,
  internalUsers,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getConversationDetail>>>;
  userId: number;
  companies: { id: number; name: string }[];
  projects: { id: number; name: string }[];
  internalUsers: { id: number; name: string }[];
}) {
  const conv = detail.conversation;
  const title =
    conv.subject ??
    (detail.ticketFolio ? `${detail.ticketFolio} · ${detail.ticketTitle ?? ""}` : null) ??
    detail.companyName ??
    `Conversación #${conv.id}`;
  const hasUnread =
    detail.myState?.lastReadAt == null ||
    detail.messages.some(
      (m) =>
        m.direction !== "system" &&
        m.authorUserId !== userId &&
        m.occurredAt > (detail.myState?.lastReadAt as Date),
    );
  const participantIds = new Set(detail.participants.map((p) => p.userId));

  return (
    <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_260px]">
      <Card className="flex min-h-[60vh] flex-col p-0">
        <AutoMarkRead conversationId={conv.id} hasUnread={hasUnread} />
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
            <p className="text-xs text-muted">
              {detail.companyName ?? "Sin cliente"}
              {detail.contactName ? ` · ${detail.contactName}` : ""}
              {" · "}
              {conv.channel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusSelectForm conversationId={conv.id} status={conv.status} />
            <ConversationControls
              conversationId={conv.id}
              pinned={detail.myState?.pinnedAt != null}
              favorite={detail.myState?.favoriteAt != null}
              hasUnread={hasUnread}
            />
          </div>
        </div>

        {/* messages */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {detail.messages.length === 0 ? (
            <p className="text-sm text-muted">Sin mensajes todavía — escribe el primero.</p>
          ) : (
            detail.messages.map((m) => {
              if (m.direction === "system") {
                return (
                  <p key={m.id} className="text-center text-xs text-faint">
                    {m.body} · {fmtDateTime(m.occurredAt)}
                  </p>
                );
              }
              const mine = m.authorUserId === userId;
              const mentions = detail.mentionsByMessage.get(m.id) ?? [];
              const files = detail.attachmentsByMessage.get(m.id) ?? [];
              return (
                <div key={m.id} className={cx("group flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cx(
                      "max-w-[85%] rounded-xl border px-3 py-2",
                      m.direction === "internal"
                        ? "border-amber-300/60 bg-amber-50/60 dark:bg-amber-400/10"
                        : mine || m.direction === "outbound"
                          ? "border-primary/20 bg-primary-soft/60"
                          : "border-edge bg-subtle",
                    )}
                  >
                    <div className="mb-0.5 flex items-center gap-2 text-[11px] text-faint">
                      <span className="font-medium text-muted">
                        {m.authorName ?? "Contacto"}
                      </span>
                      {m.direction === "internal" ? <span>Nota interna</span> : null}
                      {m.direction === "inbound" ? <span>Entrante · {m.channel}</span> : null}
                      {m.direction === "outbound" && m.channel !== "internal" ? <span>{m.channel}</span> : null}
                      <span>{fmtDateTime(m.occurredAt)}</span>
                      {m.editedAt && !m.deletedAt ? <span>(editado)</span> : null}
                      {!m.deletedAt && m.authorUserId === userId ? (
                        <MessageActions
                          key={`${m.id}-${m.editedAt?.getTime() ?? 0}`}
                          messageId={m.id}
                          conversationId={conv.id}
                          body={m.body}
                        />
                      ) : null}
                    </div>
                    {m.deletedAt ? (
                      <p className="text-sm text-faint italic">Mensaje eliminado</p>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap text-fg">{m.body}</p>
                    )}
                    {!m.deletedAt && mentions.length > 0 ? (
                      <p className="mt-1 text-[11px] text-primary">
                        @ {mentions.map((x) => x.userName).join(", ")}
                      </p>
                    ) : null}
                    {!m.deletedAt && files.length > 0 ? (
                      <p className="mt-1 space-x-2 text-[11px]">
                        {files.map((f) => (
                          <a
                            key={f.id}
                            href={`/api/attachments/${f.id}`}
                            className="text-primary hover:underline"
                          >
                            📎 {f.filename}
                          </a>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Composer
          key={`composer-${detail.messages[detail.messages.length - 1]?.id ?? 0}`}
          conversationId={conv.id}
          internalUsers={internalUsers}
          archived={conv.status === "archived"}
        />
      </Card>

      {/* side panel: links & participants */}
      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">Vinculado a</h3>
          <ul className="space-y-1.5 text-sm">
            {conv.ticketId ? (
              <li>
                <Link href={`/helpdesk/${conv.ticketId}`} className="text-primary hover:underline">
                  Ticket {detail.ticketFolio}
                </Link>
              </li>
            ) : null}
            {conv.companyId ? (
              <li>
                <Link href={`/companies/${conv.companyId}`} className="text-primary hover:underline">
                  Empresa: {detail.companyName}
                </Link>
              </li>
            ) : null}
            {detail.activity ? (
              <li>
                <Link href={`/activities/${detail.activity.id}`} className="text-primary hover:underline">
                  Actividad: {detail.activity.title}
                </Link>
              </li>
            ) : null}
            {conv.projectId ? (
              <li>
                <Link href={`/projects/${conv.projectId}`} className="text-primary hover:underline">
                  Proyecto: {detail.projectName}
                </Link>
              </li>
            ) : null}
            {!conv.ticketId && !conv.companyId && !detail.activity && !conv.projectId ? (
              <li className="text-muted">Sin vínculos.</li>
            ) : null}
          </ul>
          <div className="mt-3 border-t border-edge pt-3">
            <LinkConversationForm
              conversationId={conv.id}
              companies={companyRows}
              projects={projectRows}
              current={{
                companyId: conv.companyId,
                contactId: conv.contactId,
                ticketId: conv.ticketId,
                workItemId: conv.workItemId,
                projectId: conv.projectId,
              }}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
            Participantes ({detail.participants.length})
          </h3>
          <ul className="mb-3 space-y-1 text-sm text-fg">
            {detail.participants.map((p) => (
              <li key={p.id}>{p.userName}</li>
            ))}
            {detail.participants.length === 0 ? <li className="text-muted">Todavía nadie.</li> : null}
          </ul>
          <AddParticipantForm
            conversationId={conv.id}
            candidates={internalUsers.filter((u) => !participantIds.has(u.id))}
          />
        </Card>
      </div>
    </div>
  );
}
