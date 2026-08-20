import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getSetting } from "@/lib/settings-data";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const [org] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).limit(1);
  const profile = org ? await getSetting(org.id, "organization.profile") : null;
  const orgName = profile?.displayName ?? org?.name ?? "Watson";
  const logo = profile?.logo ?? null;

  return (
    <main className="flex min-h-screen flex-1">
      {/* Brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-center overflow-hidden bg-[#0b1120] p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 size-[480px] rounded-full bg-purple-600/15 blur-3xl"
        />

        <div className="relative max-w-md">
          {/* Dedicated dark-background variant — the org's general profile logo (used
              in Settings/PDFs, both light backgrounds) has a wordmark with no contrast here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/waxxor-logo-dark.png" alt={orgName} className="mb-8 h-auto w-full" />
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-white">
            Convertimos empresas en empresas ciberseguras.
          </h1>
        </div>
      </aside>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={orgName} className="h-11 w-auto" />
            ) : (
              <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 text-lg font-bold text-white shadow-card">
                {orgName.charAt(0)}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-fg">Welcome back</h2>
          <p className="mt-1.5 text-sm text-muted">
            Sign in to your Waxxor account.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
          <p className="mt-8 text-xs text-faint">
            Access is provisioned by your administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
