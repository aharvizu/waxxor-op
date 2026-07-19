"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { Fragment } from "react";

/**
 * Every top-level and known nested segment gets a human label — kept
 * exhaustive on purpose (UX audit, 2026-07-20): an unmapped segment falls
 * back to Title Case of the slug rather than showing raw router text.
 */
const segmentLabels: Record<string, string> = {
  today: "Hoy",
  dashboard: "Dashboard",
  inbox: "Inbox",
  activities: "Activities",
  helpdesk: "Tickets",
  projects: "Projects",
  recurring: "Recurring",
  companies: "Empresas",
  contacts: "Contactos",
  knowledge: "Knowledge Base",
  help: "Help Center",
  reports: "Reports",
  indicators: "Indicators",
  kpis: "KPIs",
  quotes: "Quotes",
  settings: "Settings",
  users: "Users",
  sla: "SLA",
  roles: "Roles & Permissions",
  tickets: "Tickets",
  templates: "Templates",
  audit: "Audit",
  "api-keys": "API Keys",
  environment: "Environment",
  health: "System Health",
  new: "New",
  convert: "Convert",
  print: "Print",
};

function labelFor(segment: string) {
  if (/^\d+$/.test(segment)) return `#${segment}`;
  if (segmentLabels[segment]) return segmentLabels[segment];
  // Fallback: Title Case of an unmapped kebab-case slug — still readable if
  // this list ever falls out of sync with the routes.
  return segment
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Link
        href="/today"
        aria-label="Home"
        className="flex items-center rounded-md p-1 text-faint transition-colors hover:bg-subtle hover:text-fg"
      >
        <Home className="size-4" />
      </Link>
      {segments.map((segment, i) => {
        const href = `/${segments.slice(0, i + 1).join("/")}`;
        const last = i === segments.length - 1;
        return (
          <Fragment key={href}>
            <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />
            {last ? (
              <span aria-current="page" className="truncate font-medium text-fg">
                {labelFor(segment)}
              </span>
            ) : (
              <Link
                href={href}
                className="truncate rounded-md px-1 py-0.5 text-muted transition-colors hover:bg-subtle hover:text-fg"
              >
                {labelFor(segment)}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
