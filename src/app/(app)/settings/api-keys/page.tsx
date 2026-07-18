import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { getApiKeys } from "@/lib/settings-data";
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
  const keys = await getApiKeys(user.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        subtitle="Infraestructura de claves (preparación). Ningún servicio externo las consume todavía."
      />

      <Card className="p-5">
        <CardHeader
          title="Generar clave"
          description="El token se muestra una sola vez; Watson almacena únicamente su hash SHA-256."
        />
        <ApiKeyCreateForm />
      </Card>

      <Card>
        <CardHeader title={`Claves (${keys.length})`} />
        {keys.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<KeyRound className="size-6" />} title="Sin claves">
              Genera una clave cuando exista una integración que la necesite.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Nombre</Th>
                <Th>Prefijo</Th>
                <Th>Creada</Th>
                <Th>Último uso</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </THead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-edge">
                  <Td className="font-medium text-fg">{k.name}</Td>
                  <Td className="font-mono text-xs">{k.prefix}…</Td>
                  <Td className="text-xs">{fmtDateTime(k.createdAt)}</Td>
                  <Td className="text-xs">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Nunca"}</Td>
                  <Td>
                    {k.revokedAt ? (
                      <Badge tone="red">Revocada</Badge>
                    ) : (
                      <Badge tone="green">Activa</Badge>
                    )}
                  </Td>
                  <Td>{!k.revokedAt ? <RevokeApiKeyButton keyId={k.id} /> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="border-t border-edge px-5 py-3 text-xs text-muted">
          Fuera de alcance por decisión: SSO, LDAP, Azure AD, Google Workspace Sync y cualquier
          integración externa. Esta pantalla solo deja lista la infraestructura.
        </p>
      </Card>
    </div>
  );
}
