"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { Fragment } from "react";

const segmentLabels: Record<string, string> = {
  helpdesk: "Helpdesk",
  projects: "Projects",
  quotes: "Quotes",
  reports: "Reports",
  templates: "Templates",
  kpis: "KPIs",
  clients: "Clients",
  users: "Users",
  new: "New",
};

function labelFor(segment: string) {
  if (/^\d+$/.test(segment)) return `#${segment}`;
  return segmentLabels[segment] ?? segment;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Link
        href="/"
        aria-label="Dashboard"
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
