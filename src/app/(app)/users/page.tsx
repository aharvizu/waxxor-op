import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { AlertCircle, Users } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { roleMeta } from "@/lib/labels";
import { ROLES } from "@/lib/roles";
import { requireRole } from "@/lib/session";
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
  inputClass,
  labelClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createUser } from "./actions";

export const metadata: Metadata = { title: "Users" };

const errorMessages: Record<string, string> = {
  "email-taken": "That email is already in use by another user.",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireRole("superadmin");
  const { error } = await searchParams;
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, me.organizationId))
    .orderBy(asc(users.name));

  return (
    <div>
      <PageHeader title="Users" subtitle="Team members who can sign in to Waxxor Ops." />

      {error && errorMessages[error] ? (
        <div
          role="alert"
          className="mb-5 flex items-center gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" />
          {errorMessages[error]}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState icon={<Users />} title="No users yet">
              Add the first team member on the right.
            </EmptyState>
          ) : (
            <Card className="overflow-visible">
              <Table>
                <THead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Role</Th>
                    <Th>Title</Th>
                    <Th>Phone</Th>
                  </tr>
                </THead>
                <tbody className="divide-y divide-edge">
                  {rows.map((u) => (
                    <tr key={u.id} className="group transition-colors hover:bg-subtle">
                      <Td>
                        <Link
                          href={`/users/${u.id}`}
                          className="flex items-center gap-3"
                        >
                          <Avatar name={u.name} size="md" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-fg transition-colors group-hover:text-primary">
                              {u.name}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {u.email}
                            </span>
                          </span>
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone={roleMeta[u.role]?.tone ?? "slate"}>
                          {roleMeta[u.role]?.label ?? u.role}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{u.title ?? "—"}</Td>
                      <Td className="text-muted tabular-nums">{u.phone ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader
            title="Add user"
            description="They’ll sign in with this email and password."
          />
          <form action={createUser} className="space-y-4 p-5">
            <div>
              <label htmlFor="name" className={labelClass}>
                Full name
              </label>
              <input id="name" name="name" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input id="email" name="email" type="email" required className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="role" className={labelClass}>
                  Role
                </label>
                <select id="role" name="role" defaultValue="technician" className={inputClass}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleMeta[r]?.label ?? r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="title" className={labelClass}>
                  Job title
                </label>
                <input id="title" name="title" className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone
              </label>
              <input id="phone" name="phone" className={inputClass} />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                className={inputClass}
              />
            </div>
            <SubmitButton>Add user</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
