import { jsRankOf } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

/** Static settings pages — same pattern as actions.ts, no DB lookup. */
const SETTINGS_PAGES: { title: string; description: string; keywords: string; route: string }[] = [
  { title: "Configuración general", description: "Panel de configuración", keywords: "settings general", route: "/settings" },
  { title: "Usuarios", description: "Administrar usuarios y roles", keywords: "users usuarios equipo", route: "/settings/users" },
  { title: "Roles y permisos", description: "Configurar roles", keywords: "roles permisos rbac", route: "/settings/roles" },
  { title: "SLA", description: "Definiciones de SLA", keywords: "sla acuerdos nivel servicio", route: "/settings/sla" },
  { title: "Tickets", description: "Configuración de Tickets", keywords: "tickets helpdesk configuracion", route: "/settings/tickets" },
  { title: "Projects", description: "Configuración de Projects", keywords: "projects proyectos configuracion", route: "/settings/projects" },
  { title: "Activities", description: "Configuración de Activities", keywords: "activities actividades configuracion", route: "/settings/activities" },
  { title: "Recurring", description: "Configuración de Recurring", keywords: "recurring recurrencias configuracion", route: "/settings/recurring" },
  { title: "Custom Fields", description: "Campos personalizados", keywords: "custom fields campos personalizados", route: "/settings/custom-fields" },
  { title: "Empresas", description: "Configuración de Companies", keywords: "companies empresas configuracion", route: "/settings/companies" },
  { title: "Knowledge Base", description: "Configuración de la Base de Conocimiento", keywords: "knowledge kb configuracion", route: "/settings/knowledge" },
  { title: "Reportes", description: "Configuración de Reportes", keywords: "reports reportes configuracion", route: "/settings/reports" },
  { title: "Indicadores", description: "Configuración de Indicadores", keywords: "indicators indicadores kpi configuracion", route: "/settings/indicators" },
  { title: "Auditoría", description: "Bitácora de auditoría", keywords: "audit auditoria log", route: "/settings/audit" },
  { title: "API Keys", description: "Llaves de API", keywords: "api keys llaves", route: "/settings/api-keys" },
  { title: "Ambiente", description: "Estado del entorno", keywords: "environment ambiente health", route: "/settings/environment" },
];

registerSource({
  category: "settings",
  label: "Configuración",
  iconKey: "settings",
  async search(_ctx, query, limit) {
    const items: SearchResultItem[] = [];
    for (const page of SETTINGS_PAGES) {
      const rank = jsRankOf(`${page.title} ${page.keywords}`, query);
      if (rank === null) continue;
      items.push({
        id: `settings:${page.route}`,
        category: "settings",
        iconKey: "settings",
        title: page.title,
        description: page.description,
        route: page.route,
        breadcrumb: ["Configuración", page.title],
        rank,
      });
    }
    return items.sort((a, b) => a.rank - b.rank).slice(0, limit);
  },
});
