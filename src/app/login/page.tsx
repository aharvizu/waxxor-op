import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600 text-xl font-bold text-white">
            W
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Waxxor Ops
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Information Security · Business Operations
          </p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-xl">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Internal system · waxxor.com
        </p>
      </div>
    </main>
  );
}
