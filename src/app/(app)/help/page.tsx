import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { HELP_MODULE_LABELS, HELP_MODULES, progressStatus } from "@/lib/help";
import { getTutorialsWithProgress } from "@/lib/help-data";
import { requireUser } from "@/lib/session";
import { Badge, EmptyState, PageHeader, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Centro de Ayuda" };

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const items = await getTutorialsWithProgress(Number(user.id));

  const filtered = q?.trim()
    ? items.filter(({ tutorial }) =>
        `${tutorial.title} ${tutorial.objective}`.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : items;

  const byModule = new Map<string, typeof items>();
  for (const item of filtered) {
    const list = byModule.get(item.tutorial.module);
    if (list) list.push(item);
    else byModule.set(item.tutorial.module, [item]);
  }

  return (
    <div>
      <PageHeader
        title="Centro de Ayuda"
        subtitle="Tutoriales y recorridos guiados para aprender a usar Watson, módulo por módulo."
      />

      <form method="get" className="mb-6 max-w-lg">
        <input name="q" defaultValue={q ?? ""} placeholder="Buscar tutoriales…" className={inputClass} />
      </form>

      {filtered.length === 0 ? (
        <EmptyState icon={<PlayCircle className="size-6" />} title="Sin resultados">
          Ningún tutorial coincide con tu búsqueda.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {HELP_MODULES.filter((m) => byModule.has(m)).map((moduleKey) => (
            <section key={moduleKey}>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-faint uppercase">
                {HELP_MODULE_LABELS[moduleKey]}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {byModule.get(moduleKey)!.map(({ tutorial, progress }) => {
                  const status = progressStatus(progress);
                  return (
                    <Link
                      key={tutorial.id}
                      href={`/help/${tutorial.slug}`}
                      className="block rounded-xl border border-edge bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-fg">{tutorial.title}</h3>
                        {status === "completed" ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Completado" />
                        ) : status === "in_progress" ? (
                          <Badge tone="amber">En progreso</Badge>
                        ) : (
                          <Circle className="size-4 shrink-0 text-faint" aria-label="Sin empezar" />
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted">{tutorial.objective}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
