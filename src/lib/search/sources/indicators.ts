import { INDICATOR_DEFINITIONS } from "@/lib/indicators";
import { jsRankOf } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

/** Indicator definitions are a static, shared catalog (lib/indicators.ts) — no table to query. */
registerSource({
  category: "indicators",
  label: "Indicadores",
  iconKey: "indicator",
  async search(_ctx, query, limit) {
    const items: SearchResultItem[] = [];
    for (const def of INDICATOR_DEFINITIONS) {
      const rank = jsRankOf(`${def.name} ${def.description}`, query);
      if (rank === null) continue;
      items.push({
        id: `indicators:${def.key}`,
        category: "indicators",
        iconKey: "indicator",
        title: def.name,
        description: def.description,
        route: def.drillDownRoute ?? "/indicators",
        breadcrumb: ["Indicadores", def.name],
        rank,
      });
    }
    return items.sort((a, b) => a.rank - b.rank).slice(0, limit);
  },
});
