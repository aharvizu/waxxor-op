import type { Metadata } from "next";
import { getSetting } from "@/lib/settings-data";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SettingSectionForm } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Recurrentes" };

export default async function RecurringSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const defaults = await getSetting(user.organizationId, "recurrence.defaults");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Recurrentes", "Recurring", locale)}
        subtitle={t(
          "Valores por defecto del asistente y política de fallos del motor.",
          "Wizard default values and the engine's failure policy.",
          locale,
        )}
      />

      <Card className="p-5">
        <CardHeader
          title={t("Valores por defecto", "Default values", locale)}
          description={t(
            "Se preseleccionan al crear una recurrencia nueva; cada recurrencia guarda los suyos.",
            "Preselected when creating a new recurrence; each recurrence keeps its own.",
            locale,
          )}
        />
        <SettingSectionForm settingKey="recurrence.defaults">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>{t("Zona horaria por defecto (IANA)", "Default time zone (IANA)", locale)}</label>
              <input
                name="defaultTimezone"
                defaultValue={defaults.defaultTimezone}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("Hora de ejecución por defecto", "Default run time", locale)}</label>
              <input
                name="defaultTimeOfDay"
                type="time"
                defaultValue={defaults.defaultTimeOfDay}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("Fallos consecutivos antes de pausar", "Consecutive failures before pausing", locale)}</label>
              <input
                name="maxConsecutiveFailures"
                type="number"
                min={1}
                max={10}
                defaultValue={defaults.maxConsecutiveFailures}
                required
                className={inputClass}
              />
            </div>
          </div>
        </SettingSectionForm>
      </Card>

      <Card className="p-5">
        <CardHeader title={t("Política de reintentos", "Retry policy", locale)} />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>
            {t("El motor", "The engine", locale)} <span className="font-medium text-fg">{t("no reintenta automáticamente", "does not retry automatically", locale)}</span>
            {t(
              ": un fallo queda registrado en la ejecución y disponible para reintento manual desde el detalle de la recurrencia.",
              ": a failure is logged in the run and available for manual retry from the recurrence's detail page.",
              locale,
            )}
          </li>
          <li>
            {t("Tras el número configurado de fallos consecutivos, la recurrencia pasa a estado", "After the configured number of consecutive failures, the recurrence moves to", locale)}{" "}
            <span className="font-medium text-fg">error</span>{" "}
            {t(
              "(pausada y auditada) para evitar reintentos infinitos silenciosos.",
              "status (paused and audited) to avoid silent infinite retries.",
              locale,
            )}
          </li>
          <li>
            {t(
              "Si el scheduler no corrió por un periodo, usa Backfill (SuperAdmin/Administrator/Director) desde el detalle de la recurrencia — nunca genera duplicados (idempotencia por índice único).",
              "If the scheduler didn't run for a period, use Backfill (SuperAdmin/Administrator/Director) from the recurrence's detail page — it never creates duplicates (idempotent via a unique index).",
              locale,
            )}
          </li>
        </ul>
      </Card>
    </div>
  );
}
