"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { helpChatMessages } from "@/db/schema";
import { askAssistant, MissingApiKeyError } from "@/lib/help-assistant";
import { getChatHistory } from "@/lib/help-assistant-data";
import { requireUser } from "@/lib/session";

/** How many prior turns (of the full persisted history) go to the model as context. */
const HISTORY_WINDOW = 20;

const questionSchema = z
  .string()
  .trim()
  .min(1, "Escribe una pregunta.")
  .max(4000, "La pregunta es demasiado larga.");

export type AssistantReply = { ok: true; answer: string } | { ok: false; message: string };

/** Called directly from the chat client component (not a <form>, no useActionState). */
export async function askHelpAssistant(question: string): Promise<AssistantReply> {
  const user = await requireUser();
  const parsed = questionSchema.safeParse(question);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Pregunta inválida." };
  }

  await db.insert(helpChatMessages).values({
    organizationId: user.organizationId,
    userId: Number(user.id),
    role: "user",
    content: parsed.data,
  });

  const priorMessages = await getChatHistory(user.organizationId, Number(user.id));
  const recent = priorMessages.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: m.content }));

  let answer: string;
  try {
    answer = await askAssistant(recent);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return { ok: false, message: "El asistente no está configurado todavía (falta OPENAI_API_KEY)." };
    }
    console.error("Help assistant error:", err);
    return { ok: false, message: "No se pudo obtener respuesta del asistente. Intenta de nuevo." };
  }

  await db.insert(helpChatMessages).values({
    organizationId: user.organizationId,
    userId: Number(user.id),
    role: "assistant",
    content: answer,
  });

  revalidatePath("/help/assistant");
  return { ok: true, answer };
}
