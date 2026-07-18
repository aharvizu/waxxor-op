import type { Metadata } from "next";
import { getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SettingSectionForm } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Recurrentes" };

export default async function RecurringSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const defaults = await getSetting(user.organizationId, "recurrence.defaults");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurrentes"
        subtitle="Valores por defecto del asistente y política de fallos del motor."
      />

      <Card className="p-5">
        <CardHeader
          title="Valores por defecto"
          description="Se preseleccionan al crear una recurrencia nueva; cada recurrencia guarda los suyos."
        />
        <SettingSectionForm settingKey="recurrence.defaults">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Zona horaria por defecto (IANA)</label>
              <input
                name="defaultTimezone"
                defaultValue={defaults.defaultTimezone}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Hora de ejecución por defecto</label>
              <input
                name="defaultTimeOfDay"
                type="time"
                defaultValue={defaults.defaultTimeOfDay}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Fallos consecutivos antes de pausar</label>
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
        <CardHeader title="Política de reintentos" />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>
            El motor <span className="font-medium text-fg">no reintenta automáticamente</span>: un
            fallo queda registrado en la ejecución y disponible para reintento manual desde el
            detalle de la recurrencia.
          </li>
          <li>
            Tras el número configurado de fallos consecutivos, la recurrencia pasa a estado{" "}
            <span className="font-medium text-fg">error</span> (pausada y auditada) para evitar
            reintentos infinitos silenciosos.
          </li>
          <li>
            Si el scheduler no corrió por un periodo, usa Backfill (SuperAdmin/Administrator/
            Director) desde el detalle de la recurrencia — nunca genera duplicados (idempotencia por
            índice único).
          </li>
        </ul>
      </Card>
    </div>
  );
}
