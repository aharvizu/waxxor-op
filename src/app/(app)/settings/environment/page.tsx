import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, MinusCircle } from "lucide-react";
import { ENV_CHECKS, maskSecret } from "@/lib/settings";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, THead, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Configuración · Entorno" };

/**
 * Read-only diagnostics of the runtime configuration. Secrets are always
 * masked (first 4 chars + length) — the full value never reaches the response.
 */
export default async function EnvironmentSettingsPage() {
  const user = await requireRole("superadmin");
  const locale = await getOrgLocale(user.organizationId);

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
        title={t("Variables de entorno", "Environment variables", locale)}
        subtitle={t(
          "Diagnóstico de configuración del despliegue. Los secretos nunca se muestran completos.",
          "Deployment configuration diagnostics. Secrets are never shown in full.",
          locale,
        )}
      />

      {missingRequired.length > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {t("Faltan variables requeridas", "Missing required variables", locale)}: {missingRequired.map((r) => r.name).join(", ")}.
        </div>
      ) : (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success/5 px-4 py-3 text-sm text-success"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {t(
            "Configuración válida: todas las variables requeridas están presentes.",
            "Valid configuration: all required variables are present.",
            locale,
          )}
        </div>
      )}

      <Card>
        <CardHeader
          title={t("Variables", "Variables", locale)}
          description={t(
            "La convención del proyecto es .env (no .env.local).",
            "The project convention is .env (not .env.local).",
            locale,
          )}
        />
        <Table>
          <THead>
            <tr>
              <Th>{t("Variable", "Variable", locale)}</Th>
              <Th>{t("Estado", "Status", locale)}</Th>
              <Th>{t("Valor", "Value", locale)}</Th>
              <Th>{t("Uso", "Usage", locale)}</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-edge">
                <Td className="font-mono text-xs">{r.name}</Td>
                <Td>
                  {r.present ? (
                    <Badge tone="green">{t("Presente", "Present", locale)}</Badge>
                  ) : r.required ? (
                    <Badge tone="red">{t("Faltante", "Missing", locale)}</Badge>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <MinusCircle className="size-3.5" aria-hidden /> {t("Opcional, ausente", "Optional, absent", locale)}
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
