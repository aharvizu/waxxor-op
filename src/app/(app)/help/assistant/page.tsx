import type { Metadata } from "next";
import { getChatHistory } from "@/lib/help-assistant-data";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { HelpTabs } from "../help-tabs";
import { AssistantChat } from "./assistant-chat";

export const metadata: Metadata = { title: "Asistente · Centro de Ayuda" };

export default async function HelpAssistantPage() {
  const user = await requireUser();
  const history = await getChatHistory(user.organizationId, Number(user.id));

  return (
    <div>
      <PageHeader
        title="Asistente"
        subtitle="Responde en base a la documentación de cada módulo de Watson."
      />

      <HelpTabs active="assistant" />

      <AssistantChat
        initialMessages={history.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
      />
    </div>
  );
}
