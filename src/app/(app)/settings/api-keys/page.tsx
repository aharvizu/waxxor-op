import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { getApiKeys } from "@/lib/settings-data";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ApiKeyCreateForm, RevokeApiKeyButton } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · API Keys" };

export default async function ApiKeysSettingsPage() {
  const user = await requireRole("superadmin");
  const locale = await getOrgLocale(user.organizationId);
  const keys = await getApiKeys(user.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        subtitle={t(
          "Infraestructura de claves (preparación). Ningún servicio externo las consume todavía.",
          "Key infrastructure (preparation). No external service consumes them yet.",
          locale,
        )}
      />

      <Card className="p-5">
        <CardHeader
          title={t("Generar clave", "Generate key", locale)}
          description={t(
            "El token se muestra una sola vez; Watson almacena únicamente su hash SHA-256.",
            "The token is shown only once; Watson stores only its SHA-256 hash.",
            locale,
          )}
        />
        <ApiKeyCreateForm />
      </Card>

      <Card>
        <CardHeader title={`${t("Claves", "Keys", locale)} (${keys.length})`} />
        {keys.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<KeyRound className="size-6" />} title={t("Sin claves", "No keys", locale)}>
              {t(
                "Genera una clave cuando exista una integración que la necesite.",
                "Generate a key once there's an integration that needs it.",
                locale,
              )}
            </EmptyState>
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>{t("Nombre", "Name", locale)}</Th>
                <Th>{t("Prefijo", "Prefix", locale)}</Th>
                <Th>{t("Creada", "Created", locale)}</Th>
                <Th>{t("Último uso", "Last used", locale)}</Th>
                <Th>{t("Estado", "Status", locale)}</Th>
                <Th>{t("Acciones", "Actions", locale)}</Th>
              </tr>
            </THead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-edge">
                  <Td className="font-medium text-fg">{k.name}</Td>
                  <Td className="font-mono text-xs">{k.prefix}…</Td>
                  <Td className="text-xs">{fmtDateTime(k.createdAt)}</Td>
                  <Td className="text-xs">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : t("Nunca", "Never", locale)}</Td>
                  <Td>
                    {k.revokedAt ? (
                      <Badge tone="red">{t("Revocada", "Revoked", locale)}</Badge>
                    ) : (
                      <Badge tone="green">{t("Activa", "Active", locale)}</Badge>
                    )}
                  </Td>
                  <Td>{!k.revokedAt ? <RevokeApiKeyButton keyId={k.id} /> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="border-t border-edge px-5 py-3 text-xs text-muted">
          {t(
            "Fuera de alcance por decisión: SSO, LDAP, Azure AD, Google Workspace Sync y cualquier integración externa. Esta pantalla solo deja lista la infraestructura.",
            "Out of scope by decision: SSO, LDAP, Azure AD, Google Workspace Sync, and any external integration. This screen only prepares the infrastructure.",
            locale,
          )}
        </p>
      </Card>
    </div>
  );
}
