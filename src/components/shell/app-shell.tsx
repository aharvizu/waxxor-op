"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronsUpDown,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Avatar, Badge, cx, iconButtonClass } from "@/components/ui";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandMenu, OPEN_COMMAND_EVENT } from "./command-menu";
import { Dropdown, MenuLabel, MenuSeparator, menuItemClass } from "./dropdown";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

type NavSection = { name: string | null; items: NavItem[] };

export type ShellUser = { name: string; email: string; role: "admin" | "member" };

/* ------------------------------------------------------------------ Shell */

export function AppShell({
  user,
  openTickets,
  signOut,
  children,
}: {
  user: ShellUser;
  openTickets: number;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("wx-sidebar") === "collapsed");
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("wx-sidebar", c ? "expanded" : "collapsed");
      } catch {
        // ignore
      }
      return !c;
    });
  }

  const sections: NavSection[] = [
    {
      name: null,
      items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
      name: "Operations",
      items: [
        { href: "/helpdesk", label: "Helpdesk", icon: LifeBuoy, badge: openTickets },
        { href: "/projects", label: "Projects", icon: FolderKanban },
      ],
    },
    {
      name: "Revenue",
      items: [
        { href: "/quotes", label: "Quotes", icon: FileText },
        { href: "/reports", label: "Reports", icon: ClipboardList },
        { href: "/kpis", label: "KPIs", icon: Gauge },
      ],
    },
    {
      name: "Organization",
      items: [
        { href: "/clients", label: "Clients", icon: Building2 },
        { href: "/users", label: "Users", icon: Users },
      ],
    },
  ];

  return (
    <div className="min-h-screen">
      <Sidebar
        sections={sections}
        collapsed={collapsed}
        mounted={mounted}
        onToggle={toggleSidebar}
      />

      <div
        className={cx(
          "flex min-h-screen flex-col",
          mounted && "transition-[padding] duration-200 ease-out",
          collapsed ? "md:pl-[68px]" : "md:pl-64",
          "print:pl-0",
        )}
      >
        <Topbar user={user} signOut={signOut} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-8 lg:px-10 print:p-0">
          {children}
        </main>
      </div>

      <CommandMenu />
    </div>
  );
}

/* ---------------------------------------------------------------- Sidebar */

function Sidebar({
  sections,
  collapsed,
  mounted,
  onToggle,
}: {
  sections: NavSection[];
  collapsed: boolean;
  mounted: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cx(
        "fixed inset-y-0 left-0 z-40 hidden flex-col bg-sidebar md:flex",
        mounted && "transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px]" : "w-64",
        "print:hidden",
      )}
    >
      {/* Org switcher */}
      <div className={cx("px-3 pt-4 pb-2", collapsed && "px-3.5")}>
        <Dropdown
          align="start"
          buttonLabel="Organization"
          buttonClassName={cx(
            "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-150 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            collapsed && "justify-center",
          )}
          panelClassName="w-60"
          button={
            <>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 text-sm font-bold text-white shadow-card">
                W
              </span>
              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      Waxxor Ops
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      Information Security
                    </span>
                  </span>
                  <ChevronsUpDown className="size-3.5 shrink-0 text-slate-500" />
                </>
              ) : null}
            </>
          }
        >
          <MenuLabel>Organization</MenuLabel>
          <div className={cx(menuItemClass, "cursor-default")}>
            <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-purple-700 text-[11px] font-bold text-white">
              W
            </span>
            <span className="flex-1">Waxxor</span>
            <Check className="size-4 text-primary" />
          </div>
          <MenuSeparator />
          <div className="px-2.5 py-1.5 text-xs text-faint">
            waxxor.com · Enterprise plan
          </div>
        </Dropdown>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
        {sections.map((section, si) => (
          <div key={section.name ?? si} className={cx(si > 0 && "mt-6")}>
            {section.name ? (
              collapsed ? (
                <div className="mx-2 mb-2 h-px bg-white/[0.07]" />
              ) : (
                <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                  {section.name}
                </div>
              )
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-white/[0.06] text-white"
                          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                        />
                      ) : null}
                      <item.icon
                        className={cx(
                          "size-[18px] shrink-0 transition-colors duration-150",
                          active
                            ? "text-purple-400"
                            : "text-slate-500 group-hover:text-slate-300",
                        )}
                      />
                      {!collapsed ? (
                        <>
                          <span className="truncate">{item.label}</span>
                          {item.badge ? (
                            <span className="ml-auto rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-medium text-slate-300 tabular-nums">
                              {item.badge}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.07] p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cx(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors duration-150 hover:bg-white/[0.04] hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" />
          ) : (
            <>
              <PanelLeftClose className="size-[18px]" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

/* ----------------------------------------------------------------- Topbar */

function Topbar({ user, signOut }: { user: ShellUser; signOut: () => Promise<void> }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-edge bg-canvas/85 px-6 backdrop-blur-md print:hidden">
      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-1.5">
        {/* Quick search */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
          className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-sm text-faint shadow-card transition-colors duration-150 hover:border-edge-strong hover:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 lg:flex"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded-md border border-edge bg-subtle px-1.5 py-0.5 font-sans text-[11px] font-medium">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          aria-label="Search"
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
          className={cx(iconButtonClass, "lg:hidden")}
        >
          <Search className="size-4" />
        </button>

        {/* Quick create */}
        <Dropdown
          buttonLabel="Quick create"
          buttonClassName="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-white shadow-card transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-[0.98]"
          button={
            <>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Create</span>
              <ChevronDown className="hidden size-3.5 opacity-70 sm:inline" />
            </>
          }
        >
          <MenuLabel>Quick create</MenuLabel>
          <Link href="/helpdesk/new" className={menuItemClass}>
            <LifeBuoy /> New ticket
          </Link>
          <Link href="/projects/new" className={menuItemClass}>
            <FolderKanban /> New project
          </Link>
          <Link href="/quotes/new" className={menuItemClass}>
            <FileText /> New quote
          </Link>
          <Link href="/reports/new" className={menuItemClass}>
            <ClipboardList /> New report
          </Link>
        </Dropdown>

        {/* Notifications */}
        <Dropdown
          buttonLabel="Notifications"
          buttonClassName={iconButtonClass}
          panelClassName="w-80"
          closeOnClick={false}
          button={<Bell className="size-4" />}
        >
          <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2">
            <span className="text-sm font-semibold text-fg">Notifications</span>
            <Badge tone="purple">0 new</Badge>
          </div>
          <MenuSeparator />
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-edge bg-subtle text-muted">
              <Inbox className="size-5" />
            </div>
            <p className="text-sm font-medium text-fg">You’re all caught up</p>
            <p className="mt-0.5 text-xs text-muted">
              New activity will show up here.
            </p>
          </div>
        </Dropdown>

        <ThemeToggle />

        <div className="mx-1.5 h-6 w-px bg-edge" aria-hidden />

        {/* User menu */}
        <Dropdown
          buttonLabel="Account"
          buttonClassName="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors duration-150 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          panelClassName="w-64"
          button={
            <>
              <Avatar name={user.name} size="sm" />
              <span className="hidden max-w-32 truncate text-sm font-medium xl:block">
                {user.name}
              </span>
              <ChevronDown className="hidden size-3.5 text-faint xl:block" />
            </>
          }
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar name={user.name} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
          </div>
          <div className="px-2.5 pb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
              <ShieldCheck className="size-3" />
              {user.role === "admin" ? "Administrator" : "Member"}
            </span>
          </div>
          <MenuSeparator />
          <form action={signOut}>
            <button type="submit" className={menuItemClass}>
              <LogOut /> Sign out
            </button>
          </form>
        </Dropdown>
      </div>
    </header>
  );
}
