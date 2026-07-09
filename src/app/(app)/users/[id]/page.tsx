import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { AlertCircle, Trash2 } from "lucide-react";
import { Card, CardHeader, PageHeader, buttonDangerClass, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteUser, updateUser } from "../actions";

export const metadata: Metadata = { title: "User" };

const errorMessages: Record<string, string> = {
  "email-taken": "That email is already in use by another user.",
  "short-password": "The new password must be at least 8 characters.",
  "self-delete": "You cannot delete your own account.",
  "in-use": "This user has tickets, tasks, or comments assigned and cannot be deleted.",
};

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const userId = Number(id);
  if (!Number.isInteger(userId)) notFound();

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title={user.name} subtitle="Edit user details." />

      {error && errorMessages[error] ? (
        <div
          role="alert"
          className="mb-5 flex items-center gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" />
          {errorMessages[error]}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader title="Profile" description="General information and access." />
        <form action={updateUser} className="space-y-4 p-6">
          <input type="hidden" name="id" value={user.id} />
          <div>
            <label htmlFor="name" className={labelClass}>
              Full name
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={user.name}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={user.email}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="role" className={labelClass}>
                Role
              </label>
              <select
                id="role"
                name="role"
                defaultValue={user.role}
                className={inputClass}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label htmlFor="title" className={labelClass}>
                Job title
              </label>
              <input
                id="title"
                name="title"
                defaultValue={user.title ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={user.phone ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>
              New password (leave blank to keep current)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <SubmitButton>Save changes</SubmitButton>
        </form>
      </Card>

      <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 border-danger/20 p-6">
        <div>
          <h2 className="text-sm font-semibold text-fg">Delete user</h2>
          <p className="mt-1 text-sm text-muted">
            Removes this account permanently. They will no longer be able to sign in.
          </p>
        </div>
        <form action={deleteUser}>
          <input type="hidden" name="id" value={user.id} />
          <button type="submit" className={buttonDangerClass}>
            <Trash2 /> Delete
          </button>
        </form>
      </Card>
    </div>
  );
}
