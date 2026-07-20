import { jsRankOf } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

/**
 * Static Quick Actions ("ejecutar acciones rápidas") — no DB lookup, just a
 * fixed, extensible list. Adding a new action means adding one entry here;
 * the engine, ranking and UI never change. `route: "__signout__"` is the
 * one recognized sentinel the Command Center's client intercepts instead of
 * navigating (see command-center.tsx) — signing out is a Server Action, not
 * a route.
 */
const QUICK_ACTIONS: { title: string; description: string; keywords: string; route: string }[] = [
  { title: "Nueva Actividad", description: "Crear una actividad", keywords: "activity crear nueva", route: "/activities/new" },
  { title: "Nuevo Ticket", description: "Crear un ticket de soporte", keywords: "ticket helpdesk soporte crear nuevo", route: "/helpdesk/new" },
  { title: "Nuevo Proyecto", description: "Crear un proyecto", keywords: "project crear nuevo", route: "/projects/new" },
  { title: "Nueva Empresa", description: "Registrar una empresa", keywords: "company cliente crear nueva", route: "/companies/new" },
  { title: "Nuevo Contacto", description: "Registrar un contacto", keywords: "contact crear nuevo", route: "/contacts/new" },
  { title: "Nuevo Recurring", description: "Crear una recurrencia", keywords: "recurring recurrencia crear nueva", route: "/recurring/new" },
  { title: "Abrir Dashboard", description: "Ir al dashboard", keywords: "dashboard inicio", route: "/dashboard" },
  { title: "Abrir Hoy", description: "Ir a tus pendientes de hoy", keywords: "hoy today pendientes", route: "/today" },
  { title: "Abrir Configuración", description: "Ir a configuración", keywords: "settings configuracion ajustes", route: "/settings" },
  { title: "Abrir Reportes", description: "Ir a reportes", keywords: "reports reportes", route: "/reports" },
  { title: "Abrir Indicadores", description: "Ir a KPIs e indicadores", keywords: "kpi indicadores metrics", route: "/indicators" },
  { title: "Cerrar sesión", description: "Salir de tu cuenta", keywords: "logout signout salir", route: "__signout__" },
];

registerSource({
  category: "actions",
  label: "Acciones",
  iconKey: "action",
  async search(_ctx, query, limit) {
    const items: SearchResultItem[] = [];
    for (const action of QUICK_ACTIONS) {
      const rank = jsRankOf(`${action.title} ${action.keywords}`, query);
      if (rank === null) continue;
      items.push({
        id: `actions:${action.route}`,
        category: "actions",
        iconKey: action.route === "__signout__" ? "signout" : "action",
        title: action.title,
        description: action.description,
        route: action.route,
        rank,
      });
    }
    return items.sort((a, b) => a.rank - b.rank).slice(0, limit);
  },
});

/** Exposed for the empty-query "acciones rápidas" panel, which shows all of
 * them (no query typed yet, nothing to rank). */
export function allQuickActions(): SearchResultItem[] {
  return QUICK_ACTIONS.map((action) => ({
    id: `actions:${action.route}`,
    category: "actions",
    iconKey: action.route === "__signout__" ? "signout" : "action",
    title: action.title,
    description: action.description,
    route: action.route,
    rank: 1,
  }));
}
