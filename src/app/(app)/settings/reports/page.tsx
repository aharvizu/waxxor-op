import type { Metadata } from "next";
import Link from "next/link";
import { getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SettingSectionForm } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Reportes" };

export default async function ReportsSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const branding = await getSetting(user.organizationId, "reports.branding");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        subtitle="Branding de la salida PDF: logo, portada, pie de página y textos corporativos."
      />

      <SettingSectionForm settingKey="reports.branding">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <CardHeader title="Logo y portada" />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Logo para reportes (PNG/JPEG/SVG/WebP, máx. ~150 KB)</label>
                {branding.logo ? (
                  <span className="mb-2 flex items-center gap-3">
                    {/* data URI inline — next/image no aplica */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={branding.logo}
                      alt="Logo actual de reportes"
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
              <div>
                <label className={labelClass}>Título de portada (opcional)</label>
                <input
                  name="coverTitle"
                  defaultValue={branding.coverTitle ?? ""}
                  placeholder="Se usa el título del reporte si se deja vacío"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Subtítulo de portada (opcional)</label>
                <input name="coverSubtitle" defaultValue={branding.coverSubtitle ?? ""} className={inputClass} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Pie de página y textos corporativos" />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Pie de página</label>
                <input
                  name="footerText"
                  defaultValue={branding.footerText ?? ""}
                  placeholder="p. ej. Watson · Operaciones — contacto@empresa.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Introducción corporativa (portada)</label>
                <textarea
                  name="corporateIntro"
                  rows={3}
                  defaultValue={branding.corporateIntro ?? ""}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Aviso de confidencialidad</label>
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
          title="Plantillas de reporte"
          description="Las plantillas (tipo, secciones, banderas de contenido) se administran en el módulo de Reportes."
        />
        <Link href="/reports/templates" className="text-sm text-primary hover:underline">
          Administrar plantillas de reporte →
        </Link>
      </Card>
    </div>
  );
}
