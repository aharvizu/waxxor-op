"use client";

import { useActionState } from "react";
import { Star } from "lucide-react";
import type { ActionState } from "@/lib/action-result";
import { cx } from "@/components/ui";
import { toggleTicketFavorite } from "./views-actions";

export function FavoriteToggle({ ticketId, isFavorite }: { ticketId: number; isFavorite: boolean }) {
  const [, formAction] = useActionState<ActionState, FormData>(toggleTicketFavorite, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={ticketId} />
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
