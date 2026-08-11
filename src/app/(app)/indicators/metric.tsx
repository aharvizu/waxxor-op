import Link from "next/link";
import { indicatorDefinition } from "@/lib/indicators";

export const NA = "No disponible";

export function Metric({
  defKey,
  value,
  href,
}: {
  defKey: string;
  value: string;
  href?: string | null;
}) {
  const def = indicatorDefinition(defKey);
  const body = (
    <span className="flex items-baseline gap-2">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted">{def?.name ?? defKey}</span>
    </span>
  );
  const target = href ?? def?.drillDownRoute;
  return target ? (
    <Link
      href={target}
      title={def ? `${def.description}\nFórmula: ${def.formula}` : undefined}
      className="rounded-lg border border-edge bg-surface px-3 py-2 shadow-card transition-colors hover:border-primary/30 hover:bg-primary-soft/40"
    >
      {body}
    </Link>
  ) : (
    <span title={def ? `${def.description}\nFórmula: ${def.formula}` : undefined} className="rounded-lg border border-edge bg-surface px-3 py-2 shadow-card">
      {body}
    </span>
  );
}
