import type { Metadata } from "next";
import Link from "next/link";
import { getSetting } from "@/lib/settings-data";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SettingSectionForm } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Reportes" };

export default async function ReportsSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const branding = await getSetting(user.organizationId, "reports.branding");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Reportes", "Reports", locale)}
        subtitle={t(
          "Branding de la salida PDF: logo, portada, pie de página y textos corporativos.",
          "PDF output branding: logo, cover page, footer, and corporate copy.",
          locale,
        )}
      />

      <SettingSectionForm settingKey="reports.branding">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <CardHeader title={t("Logo y portada", "Logo and cover page", locale)} />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>{t("Logo para reportes (PNG/JPEG/SVG/WebP, máx. ~150 KB)", "Logo for reports (PNG/JPEG/SVG/WebP, max ~150 KB)", locale)}</label>
                {branding.logo ? (
                  <span className="mb-2 flex items-center gap-3">
                    {/* data URI inline — next/image no aplica */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={branding.logo}
                      alt={t("Logo actual de reportes", "Current report logo", locale)}
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
              <div>
                <label className={labelClass}>{t("Título de portada (opcional)", "Cover title (optional)", locale)}</label>
                <input
                  name="coverTitle"
                  defaultValue={branding.coverTitle ?? ""}
                  placeholder={t("Se usa el título del reporte si se deja vacío", "The report's title is used if left empty", locale)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("Subtítulo de portada (opcional)", "Cover subtitle (optional)", locale)}</label>
                <input name="coverSubtitle" defaultValue={branding.coverSubtitle ?? ""} className={inputClass} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title={t("Pie de página y textos corporativos", "Footer and corporate copy", locale)} />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>{t("Pie de página", "Footer", locale)}</label>
                <input
                  name="footerText"
                  defaultValue={branding.footerText ?? ""}
                  placeholder={t("p. ej. Watson · Operaciones — contacto@empresa.com", "e.g. Watson · Operations — contact@company.com", locale)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("Introducción corporativa (portada)", "Corporate intro (cover page)", locale)}</label>
                <textarea
                  name="corporateIntro"
                  rows={3}
                  defaultValue={branding.corporateIntro ?? ""}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("Aviso de confidencialidad", "Confidentiality notice", locale)}</label>
                <textarea
                  name="confidentialityNotice"
                  rows={3}
                  defaultValue={branding.confidentialityNotice ?? ""}
                  className={inputClass}
                />
              </div>
            </div>
          </Card>
        </div>
      </SettingSectionForm>

      <Card className="p-5">
        <CardHeader
          title={t("Plantillas de reporte", "Report templates", locale)}
          description={t(
            "Las plantillas (tipo, secciones, banderas de contenido) se administran en el módulo de Reportes.",
            "Templates (type, sections, content flags) are managed in the Reports module.",
            locale,
          )}
        />
        <Link href="/reports/templates" className="text-sm text-primary hover:underline">
          {t("Administrar plantillas de reporte →", "Manage report templates →", locale)}
        </Link>
      </Card>
    </div>
  );
}
