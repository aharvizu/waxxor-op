import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileCheck2, LifeBuoy, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const highlights = [
  {
    icon: LifeBuoy,
    title: "Helpdesk & projects",
    body: "Every ticket, engagement, and task in one place.",
  },
  {
    icon: FileCheck2,
    title: "Quotes & reports",
    body: "Client-ready documents, printable in one click.",
  },
  {
    icon: ShieldCheck,
    title: "Built for security teams",
    body: "Role-based access for the whole Waxxor team.",
  },
];

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex min-h-screen flex-1">
      {/* Brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#0b1120] p-12 lg:flex">
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

        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 text-lg font-bold text-white shadow-lg">
            W
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Waxxor Ops</div>
            <div className="text-xs text-slate-500">Information Security</div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-white">
            Run your security business from a single pane of glass.
          </h1>
          <ul className="mt-10 space-y-6">
            {highlights.map((h) => (
              <li key={h.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-purple-400">
                  <h.icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{h.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-400">{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-600">
          Internal system · waxxor.com
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 text-lg font-bold text-white shadow-card">
              W
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-fg">Welcome back</h2>
          <p className="mt-1.5 text-sm text-muted">
            Sign in to your Waxxor Ops account.
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
