import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessCalendars, organizations } from "@/db/schema";
import { CURRENCIES, LANGUAGES } from "@/lib/settings";
import { getSetting } from "@/lib/settings-data";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { SettingSectionForm } from "./settings-forms";

export const metadata: Metadata = { title: "Configuración · Organización" };

export default async function OrganizationSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
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
        title={t("Organización", "Organization", locale)}
        subtitle={t(
          "Identidad, branding, datos fiscales y horario laboral de la organización.",
          "Identity, branding, tax data, and the organization's business hours.",
          locale,
        )}
      />

      {/* One form: the whole profile section saves atomically. */}
      <SettingSectionForm settingKey="organization.profile">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <CardHeader title={t("Identidad y branding", "Identity and branding", locale)} />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>{t("Nombre de la organización", "Organization name", locale)}</label>
                <input
                  name="displayName"
                  defaultValue={profile.displayName ?? org?.name ?? ""}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t("Moneda", "Currency", locale)}</label>
                  <SearchableSelect
                    name="currency"
                    defaultValue={profile.currency}
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("Idioma", "Language", locale)}</label>
                  <SearchableSelect
                    name="language"
                    defaultValue={profile.language}
                    options={LANGUAGES.map((l) => ({ value: l, label: l === "es" ? "Español" : "English" }))}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>{t("Color de marca", "Brand color", locale)}</label>
                <input
                  name="brandColor"
                  type="color"
                  defaultValue={profile.brandColor ?? "#7c3aed"}
                  className="h-9 w-16 cursor-pointer rounded-lg border border-edge bg-surface p-1"
                />
              </div>
              <div>
                <label className={labelClass}>{t("Logo (PNG/JPEG/SVG/WebP, máx. ~150 KB)", "Logo (PNG/JPEG/SVG/WebP, max ~150 KB)", locale)}</label>
                {profile.logo ? (
                  <span className="mb-2 flex items-center gap-3">
                    {/* data URI inline — next/image no aplica */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profile.logo}
                      alt={t("Logo actual", "Current logo", locale)}
                      className="h-10 w-auto rounded border border-edge bg-surface p-1"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      <input type="checkbox" name="clearLogo" className="size-3.5" /> {t("Quitar logo", "Remove logo", locale)}
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
            <CardHeader title={t("Datos fiscales básicos", "Basic tax data", locale)} />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>{t("Razón social", "Legal name", locale)}</label>
                <input name="legalName" defaultValue={profile.legalName ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t("RFC / Tax ID", "RFC / Tax ID", locale)}</label>
                <input name="taxId" defaultValue={profile.taxId ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t("Domicilio fiscal", "Fiscal address", locale)}</label>
                <input name="fiscalAddress" defaultValue={profile.fiscalAddress ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t("Régimen fiscal", "Tax regime", locale)}</label>
                <input name="fiscalRegime" defaultValue={profile.fiscalRegime ?? ""} className={inputClass} />
              </div>
              <p className="text-xs text-muted">
                {t(
                  "Datos informativos para portadas de reportes y documentos — Watson no emite facturas.",
                  "Informational data for report and document cover pages — Watson does not issue invoices.",
                  locale,
                )}
              </p>
            </div>
          </Card>
        </div>
      </SettingSectionForm>

      <Card className="p-5">
        <CardHeader
          title={t("Zona horaria y horario laboral", "Time zone and business hours", locale)}
          description={t(
            "Es el calendario laboral oficial, compartido con las definiciones de SLA (regla R7: solo SuperAdmin lo modifica).",
            "This is the official business calendar, shared with SLA definitions (rule R7: only SuperAdmin can modify it).",
            locale,
          )}
        />
        <p className="text-sm text-muted">
          {t("Zona horaria", "Time zone", locale)}:{" "}
          <span className="font-medium text-fg">{calendar?.timezone ?? "America/Mexico_City"}</span>
          {" · "}
          {t("Horario laboral configurado en", "Business hours configured in", locale)}{" "}
          <Link href="/settings/sla" className="text-primary hover:underline">
            {t("Configuración → SLA →", "Settings → SLA →", locale)}
          </Link>
        </p>
      </Card>
    </div>
  );
}
