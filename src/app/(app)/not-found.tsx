import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClass, Card, EmptyState } from "@/components/ui";

/**
 * In-app 404 — reached whenever a page inside the shell calls notFound()
 * (unknown ticket/project/article id, etc). Renders inside the (app) layout,
 * so the sidebar/topbar stay visible instead of dropping to a bare page.
 */
export default function AppNotFound() {
  return (
    <Card className="p-10">
      <EmptyState
        icon={<FileQuestion className="size-6" />}
        title="No encontrado"
        action={
          <Link href="/today" className={buttonClass}>
            Ir a Hoy
          </Link>
        }
      >
        Este elemento no existe o no pertenece a tu organización.
      </EmptyState>
    </Card>
  );
}
