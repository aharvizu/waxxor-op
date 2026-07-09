import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col bg-slate-950 print:hidden">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-600 font-bold text-white">
            W
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Waxxor Ops</div>
            <div className="text-xs text-slate-500">Information Security</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <SidebarNav />
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <div className="mb-2 truncate text-sm text-slate-300">{user.name}</div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="text-xs font-medium text-slate-500 hover:text-slate-300"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="ml-60 flex-1 p-8 print:ml-0 print:p-0">{children}</main>
    </div>
  );
}
