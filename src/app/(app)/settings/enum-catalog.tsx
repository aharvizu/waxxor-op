import { Badge, Card, CardHeader, type BadgeTone } from "@/components/ui";

type Meta = { label: string; tone: BadgeTone };

/**
 * Read-only view of an enum-backed catalog. Statuses/priorities/modalities are
 * pg enums (append-only, shared business rules) — "configurable cuando sea
 * compatible": today they are not, and this component says so instead of
 * simulating configurability.
 */
export function EnumCatalog({
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
        Catálogo del sistema (enum de base de datos, solo-agregar). No es editable desde la interfaz
        porque las reglas de negocio de los módulos dependen de estos valores; se documenta en lugar
        de simular configurabilidad.
      </p>
    </Card>
  );
}
