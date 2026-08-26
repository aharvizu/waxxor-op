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
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";

const SECTIONS: {
  href: string;
  labelEs: string;
  labelEn: string;
  icon: typeof Users;
  superadminOnly?: boolean;
}[] = [
  { href: "/settings", labelEs: "Organización", labelEn: "Organization", icon: Building2 },
  { href: "/settings/users", labelEs: "Usuarios", labelEn: "Users", icon: Users, superadminOnly: true },
  { href: "/settings/roles", labelEs: "Roles y permisos", labelEn: "Roles and permissions", icon: Shield },
  { href: "/settings/companies", labelEs: "Empresas", labelEn: "Companies", icon: Briefcase },
  { href: "/settings/tickets", labelEs: "Tickets", labelEn: "Tickets", icon: LifeBuoy },
  { href: "/settings/custom-fields", labelEs: "Campos Personalizados", labelEn: "Custom Fields", icon: SlidersHorizontal },
  { href: "/settings/sla", labelEs: "SLA", labelEn: "SLA", icon: Timer, superadminOnly: true },
  { href: "/settings/activities", labelEs: "Actividades", labelEn: "Activities", icon: Activity },
  { href: "/settings/projects", labelEs: "Proyectos", labelEn: "Projects", icon: FolderKanban },
  { href: "/settings/recurring", labelEs: "Recurrentes", labelEn: "Recurring", icon: Repeat },
  { href: "/settings/reports", labelEs: "Reportes", labelEn: "Reports", icon: ClipboardList },
  { href: "/settings/indicators", labelEs: "Indicadores", labelEn: "Indicators", icon: Gauge },
  { href: "/settings/knowledge", labelEs: "Conocimiento", labelEn: "Knowledge", icon: BookOpen },
  { href: "/settings/help", labelEs: "Ayuda", labelEn: "Help", icon: HelpCircle },
  { href: "/settings/audit", labelEs: "Auditoría", labelEn: "Audit", icon: ScrollText },
  { href: "/settings/api-keys", labelEs: "API Keys", labelEn: "API Keys", icon: KeyRound, superadminOnly: true },
  { href: "/settings/environment", labelEs: "Entorno", labelEn: "Environment", icon: ServerCog, superadminOnly: true },
  { href: "/settings/health", labelEs: "Salud del sistema", labelEn: "System health", icon: HeartPulse },
];

export function SettingsNav({ isSuperadmin }: { isSuperadmin: boolean }) {
  const pathname = usePathname();
  const locale = useLocale();
  const visible = SECTIONS.filter((s) => !s.superadminOnly || isSuperadmin);

  return (
    <nav aria-label={t("Configuración", "Settings", locale)} className="lg:w-56 lg:shrink-0">
      <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-faint uppercase">
        {t("Configuración", "Settings", locale)}
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
                {t(s.labelEs, s.labelEn, locale)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
