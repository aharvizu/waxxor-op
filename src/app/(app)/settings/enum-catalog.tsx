import { Badge, Card, CardHeader, type BadgeTone } from "@/components/ui";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireUser } from "@/lib/session";

type Meta = { label: string; tone: BadgeTone };

/**
 * Read-only view of an enum-backed catalog. Statuses/priorities/modalities are
 * pg enums (append-only, shared business rules) — "configurable cuando sea
 * compatible": today they are not, and this component says so instead of
 * simulating configurability.
 */
export async function EnumCatalog({
  title,
  description,
  values,
  meta,
}: {
  title: string;
  description?: string;
  values: readonly string[];
  meta?: Record<string, Meta>;
}) {
  const user = await requireUser();
  const locale = await getOrgLocale(user.organizationId);
  return (
    <Card className="p-5">
      <CardHeader title={title} description={description} />
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <Badge key={v} tone={meta?.[v]?.tone ?? "slate"}>
            {meta?.[v]?.label ?? v}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {t(
          "Catálogo del sistema (enum de base de datos, solo-agregar). No es editable desde la interfaz porque las reglas de negocio de los módulos dependen de estos valores; se documenta en lugar de simular configurabilidad.",
          "System catalog (database enum, append-only). It isn't editable from the UI because module business rules depend on these values; it's documented rather than simulating configurability.",
          locale,
        )}
      </p>
    </Card>
  );
}
