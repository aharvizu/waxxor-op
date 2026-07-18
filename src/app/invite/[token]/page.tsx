import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Invitación" };

/**
 * Public invitation-acceptance page. The token is the only credential; an
 * invalid or used token reveals nothing about accounts.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invited] = await db
    .select({ name: users.name, email: users.email, isActive: users.isActive })
    .from(users)
    .where(eq(users.invitationToken, token));

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface p-8 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-fg">Watson</h1>
            <p className="text-sm text-muted">Activación de cuenta</p>
          </div>
        </div>

        {!invited || !invited.isActive ? (
          <p className="text-sm text-muted">
            Esta invitación no es válida o ya fue utilizada. Pide a tu administrador que genere una
            nueva desde Configuración → Usuarios.
          </p>
        ) : (
          <>
            <p className="mb-5 text-sm text-muted">
              Hola <span className="font-medium text-fg">{invited.name}</span> — define la contraseña
              para <span className="font-medium text-fg">{invited.email}</span> y podrás iniciar
              sesión.
            </p>
            <InviteForm token={token} />
          </>
        )}
      </div>
    </main>
  );
}
