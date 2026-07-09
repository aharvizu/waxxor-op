"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/helpdesk", label: "Helpdesk" },
  { href: "/projects", label: "Projects" },
  { href: "/quotes", label: "Quotes" },
  { href: "/reports", label: "Reports" },
  { href: "/kpis", label: "KPIs" },
  { href: "/clients", label: "Clients" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-purple-600/15 text-purple-300"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
