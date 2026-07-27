import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const DOCS_DIR = path.join(process.cwd(), "docs", "features");
const MODEL = process.env.OPENAI_HELP_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT_HEADER = `Eres el Asistente de Watson, un Operations OS para empresas de servicios tecnológicos. Respondes preguntas internas de miembros del equipo sobre cómo funciona el sistema: sus módulos, flujos y reglas de negocio.

Reglas:
- Basa tus respuestas ÚNICAMENTE en la documentación de referencia incluida abajo. Es la fuente de verdad del producto.
- Si la documentación no cubre algo, dilo claramente en vez de inventar una regla de negocio, un botón, una ruta o un campo.
- Responde en español, de forma clara y concisa; usa listas o pasos cuando ayude a seguir un flujo.

--- DOCUMENTACIÓN DE REFERENCIA ---
`;

export class MissingApiKeyError extends Error {}

/** Read once per server process — docs/features/*.md is static, seeded content, not editable from the UI. */
let cachedDocsContext: string | null = null;

function loadFeatureDocsContext(): string {
  if (cachedDocsContext !== null) return cachedDocsContext;
  const files = readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  cachedDocsContext = files
    .map((f) => `## ${f}\n\n${readFileSync(path.join(DOCS_DIR, f), "utf-8")}`)
    .join("\n\n---\n\n");
  return cachedDocsContext;
}

function buildSystemPrompt(): string {
  return SYSTEM_PROMPT_HEADER + loadFeatureDocsContext();
}

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError("OPENAI_API_KEY is not configured.");
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

export type AssistantMessage = { role: "user" | "assistant"; content: string };

/** `history` should already include the user's latest question as the last entry. */
export async function askAssistant(history: AssistantMessage[]): Promise<string> {
  const openai = getClient();
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [{ role: "system", content: buildSystemPrompt() }, ...history],
  });
  const answer = completion.choices[0]?.message?.content;
  if (!answer) throw new Error("Empty response from the assistant model.");
  return answer;
}
