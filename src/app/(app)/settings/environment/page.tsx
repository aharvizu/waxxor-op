import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, MinusCircle } from "lucide-react";
import { ENV_CHECKS, maskSecret } from "@/lib/settings";
import { requireRole } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, THead, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Configuración · Entorno" };

/**
 * Read-only diagnostics of the runtime configuration. Secrets are always
 * masked (first 4 chars + length) — the full value never reaches the response.
 */
export default async function EnvironmentSettingsPage() {
  await requireRole("superadmin");

  const rows = ENV_CHECKS.map((check) => {
    const value = process.env[check.name];
    return {
      ...check,
      present: Boolean(value),
      display: check.secret ? maskSecret(value) : (value ?? "—"),
    };
  });
  const missingRequired = rows.filter((r) => r.required && !r.present);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Variables de entorno"
        subtitle="Diagnóstico de configuración del despliegue. Los secretos nunca se muestran completos."
      />

      {missingRequired.length > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          Faltan variables requeridas: {missingRequired.map((r) => r.name).join(", ")}.
        </div>
      ) : (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success/5 px-4 py-3 text-sm text-success"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Configuración válida: todas las variables requeridas están presentes.
        </div>
      )}

      <Card>
        <CardHeader
          title="Variables"
          description="La convención del proyecto es .env (no .env.local)."
        />
        <Table>
          <THead>
            <tr>
              <Th>Variable</Th>
              <Th>Estado</Th>
              <Th>Valor</Th>
              <Th>Uso</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-edge">
                <Td className="font-mono text-xs">{r.name}</Td>
                <Td>
                  {r.present ? (
                    <Badge tone="green">Presente</Badge>
                  ) : r.required ? (
                    <Badge tone="red">Faltante</Badge>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <MinusCircle className="size-3.5" aria-hidden /> Opcional, ausente
                    </span>
                  )}
                </Td>
                <Td className="font-mono text-xs text-muted">{r.display}</Td>
                <Td className="text-xs text-muted">{r.hint}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
