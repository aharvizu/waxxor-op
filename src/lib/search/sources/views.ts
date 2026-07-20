import { listViews, type ConfigModule } from "@/lib/views";
import { jsRankOf } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

/** Modules currently wired onto the Views Engine — see components/views/. */
const MODULE_BASE_PATH: Partial<Record<ConfigModule, string>> = {
  tickets: "/helpdesk",
  projects: "/projects",
  activities: "/activities",
  recurring: "/recurring",
};

const SCOPE_LABEL: Record<string, string> = {
  system: "Sistema",
  personal: "Personal",
  team: "Equipo",
  organization: "Organización",
};

registerSource({
  category: "views",
  label: "Vistas",
  iconKey: "view",
  async search(ctx, query, limit) {
    const modules = Object.keys(MODULE_BASE_PATH) as ConfigModule[];
    const perModule = await Promise.all(modules.map((m) => listViews(ctx.orgId, ctx.userId, m)));

    const items: SearchResultItem[] = [];
    perModule.forEach((views, i) => {
      const moduleKey = modules[i];
      const basePath = MODULE_BASE_PATH[moduleKey]!;
      for (const view of views) {
        const rank = jsRankOf(view.name, query);
        if (rank === null) continue;
        items.push({
          id: `views:${view.id}`,
          category: "views",
          iconKey: "view",
          title: view.name,
          description: `${moduleKey} · ${SCOPE_LABEL[view.scope] ?? view.scope}`,
          status: view.scope === "system" ? "Sistema" : null,
          date: view.updatedAt.toISOString(),
          route: `${basePath}?view=${view.id}`,
          breadcrumb: ["Vistas", moduleKey, view.name],
          rank,
        });
      }
    });

    return items.sort((a, b) => a.rank - b.rank).slice(0, limit);
  },
});
