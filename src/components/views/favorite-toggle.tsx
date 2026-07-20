"use client";

import { useActionState } from "react";
import { Star } from "lucide-react";
import type { ActionState } from "@/lib/action-result";
import type { ConfigModule } from "@/lib/views";
import { cx } from "@/components/ui";
import { toggleSharedItemFavorite } from "./actions";

/** Generic per-item favorite star, reused by every module (item_favorites is module-agnostic already). */
export function FavoriteToggle({ module, entityId, isFavorite, basePath }: { module: ConfigModule; entityId: number; isFavorite: boolean; basePath: string }) {
  const [, formAction] = useActionState<ActionState, FormData>(toggleSharedItemFavorite, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="module" value={module} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="path" value={basePath} />
      <button
        type="submit"
        aria-label={isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
        aria-pressed={isFavorite}
        className={cx("flex size-6 items-center justify-center rounded-md hover:bg-subtle", isFavorite ? "text-amber-400" : "text-faint")}
      >
        <Star className={cx("size-3.5", isFavorite && "fill-amber-400")} />
      </button>
    </form>
  );
}
