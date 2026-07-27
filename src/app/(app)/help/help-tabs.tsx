import Link from "next/link";
import { cx } from "@/components/ui";

export function HelpTabs({ active }: { active: "tutorials" | "assistant" }) {
  const tab = (href: string, key: typeof active, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cx(
        "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active === key ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="mb-6 flex gap-1 border-b border-edge">
      {tab("/help", "tutorials", "Tutoriales")}
      {tab("/help/assistant", "assistant", "Asistente")}
    </div>
  );
}
