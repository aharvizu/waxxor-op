"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Building2,
  ClipboardList,
  FolderKanban,
  Gauge,
  HeartPulse,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  Repeat,
  ScrollText,
  ServerCog,
  Shield,
  SlidersHorizontal,
  Timer,
  Users,
  Briefcase,
} from "lucide-react";
import { cx } from "@/components/ui";

const SECTIONS: {
  href: string;
  label: string;
  icon: typeof Users;
  superadminOnly?: boolean;
}[] = [
  { href: "/settings", label: "Organización", icon: Building2 },
  { href: "/settings/users", label: "Usuarios", icon: Users, superadminOnly: true },
  { href: "/settings/roles", label: "Roles y permisos", icon: Shield },
  { href: "/settings/companies", label: "Empresas", icon: Briefcase },
  { href: "/settings/tickets", label: "Tickets", icon: LifeBuoy },
  { href: "/settings/custom-fields", label: "Campos Personalizados", icon: SlidersHorizontal },
  { href: "/settings/sla", label: "SLA", icon: Timer, superadminOnly: true },
  { href: "/settings/activities", label: "Actividades", icon: Activity },
  { href: "/settings/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/settings/recurring", label: "Recurrentes", icon: Repeat },
  { href: "/settings/reports", label: "Reportes", icon: ClipboardList },
  { href: "/settings/indicators", label: "Indicadores", icon: Gauge },
  { href: "/settings/knowledge", label: "Conocimiento", icon: BookOpen },
  { href: "/settings/help", label: "Ayuda", icon: HelpCircle },
  { href: "/settings/audit", label: "Auditoría", icon: ScrollText },
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound, superadminOnly: true },
  { href: "/settings/environment", label: "Entorno", icon: ServerCog, superadminOnly: true },
  { href: "/settings/health", label: "Salud del sistema", icon: HeartPulse },
];

export function SettingsNav({ isSuperadmin }: { isSuperadmin: boolean }) {
  const pathname = usePathname();
  const visible = SECTIONS.filter((s) => !s.superadminOnly || isSuperadmin);

  return (
    <nav aria-label="Configuración" className="lg:w-56 lg:shrink-0">
      <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-faint uppercase">
        Configuración
      </p>
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {visible.map((s) => {
          const active = pathname === s.href;
          const Icon = s.icon;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-subtle font-medium text-fg"
                    : "text-muted hover:bg-subtle hover:text-fg",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
