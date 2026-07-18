import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessCalendars, organizations } from "@/db/schema";
import { CURRENCIES, LANGUAGES } from "@/lib/settings";
import { getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader, inputClass, labelClass } from "@/components/ui";
import { CalendarForm } from "../sla/sla-forms";
import { SettingSectionForm } from "./settings-forms";

export const metadata: Metadata = { title: "Configuración · Organización" };

export default async function OrganizationSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const [profile, [org], [calendar]] = await Promise.all([
    getSetting(user.organizationId, "organization.profile"),
    db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, user.organizationId)),
    db
      .select()
      .from(businessCalendars)
      .where(eq(businessCalendars.organizationId, user.organizationId)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organización"
        subtitle="Identidad, branding, datos fiscales y horario laboral de la organización."
      />

      {/* One form: the whole profile section saves atomically. */}
      <SettingSectionForm settingKey="organization.profile">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <CardHeader title="Identidad y branding" />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nombre de la organización</label>
                <input
                  name="displayName"
                  defaultValue={profile.displayName ?? org?.name ?? ""}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Moneda</label>
                  <select name="currency" defaultValue={profile.currency} className={inputClass}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Idioma</label>
                  <select name="language" defaultValue={profile.language} className={inputClass}>
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>{l === "es" ? "Español" : "English"}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>Color de marca</label>
                <input
                  name="brandColor"
                  type="color"
                  defaultValue={profile.brandColor ?? "#7c3aed"}
                  className="h-9 w-16 cursor-pointer rounded-lg border border-edge bg-surface p-1"
                />
              </div>
              <div>
                <label className={labelClass}>Logo (PNG/JPEG/SVG/WebP, máx. ~150 KB)</label>
                {profile.logo ? (
                  <span className="mb-2 flex items-center gap-3">
                    {/* data URI inline — next/image no aplica */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profile.logo}
                      alt="Logo actual"
                      className="h-10 w-auto rounded border border-edge bg-surface p-1"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      <input type="checkbox" name="clearLogo" className="size-3.5" /> Quitar logo
                    </label>
                  </span>
                ) : null}
                <input
                  name="logoFile"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className={inputClass}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Datos fiscales básicos" />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Razón social</label>
                <input name="legalName" defaultValue={profile.legalName ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>RFC / Tax ID</label>
                <input name="taxId" defaultValue={profile.taxId ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Domicilio fiscal</label>
                <input name="fiscalAddress" defaultValue={profile.fiscalAddress ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Régimen fiscal</label>
                <input name="fiscalRegime" defaultValue={profile.fiscalRegime ?? ""} className={inputClass} />
              </div>
              <p className="text-xs text-muted">
                Datos informativos para portadas de reportes y documentos — Watson no emite facturas.
              </p>
            </div>
          </Card>
        </div>
      </SettingSectionForm>

      <Card className="p-5">
        <CardHeader
          title="Zona horaria y horario laboral"
          description="Es el calendario laboral oficial (el mismo que usa SLA). Solo SuperAdmin puede modificarlo (regla R7)."
        />
        {user.role === "superadmin" ? (
          <CalendarForm
            calendar={{
              timezone: calendar?.timezone ?? "America/Mexico_City",
              workDays: (calendar?.workDays as number[] | null) ?? [1, 2, 3, 4, 5],
              workStartMinute: calendar?.workStartMinute ?? 9 * 60,
              workEndMinute: calendar?.workEndMinute ?? 18 * 60,
            }}
          />
        ) : (
          <p className="text-sm text-muted">
            Zona horaria:{" "}
            <span className="font-medium text-fg">{calendar?.timezone ?? "America/Mexico_City"}</span>.
            Solicita cambios a un SuperAdmin.
          </p>
        )}
      </Card>
    </div>
  );
}
