"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";
import { buttonClass, cx, inputClass } from "@/components/ui";
import { askHelpAssistant } from "../assistant-actions";

type ChatMessage = { id: number | string; role: "user" | "assistant"; content: string };

export function AssistantChat({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || pending) return;

    setError(null);
    setInput("");
    setMessages((m) => [...m, { id: `local-${Date.now()}-u`, role: "user", content: question }]);
    setPending(true);

    const result = await askHelpAssistant(question);
    setPending(false);

    if (result.ok) {
      setMessages((m) => [...m, { id: `local-${Date.now()}-a`, role: "assistant", content: result.answer }]);
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="flex h-[calc(100vh-18rem)] min-h-[420px] flex-col rounded-xl border border-edge bg-surface shadow-card">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            Pregúntame lo que quieras sobre cómo funciona Watson — por ejemplo &quot;¿cómo funciona el
            SLA?&quot; o &quot;¿cuál es la diferencia entre Actividades y Tickets?&quot;.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <div
                className={cx(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  m.role === "user" ? "bg-primary-soft text-primary" : "bg-subtle text-muted",
                )}
              >
                {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
              </div>
              <div
                className={cx(
                  "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                  m.role === "user" ? "bg-primary text-white" : "bg-subtle text-fg",
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {pending ? (
          <div className="flex gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-muted">
              <Bot className="size-4" />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-subtle px-3.5 py-2.5 text-sm text-muted">
              <Loader2 className="size-3.5 animate-spin" /> Pensando…
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="border-t border-edge px-5 py-2 text-sm text-danger">{error}</p> : null}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-edge p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta…"
          className={cx(inputClass, "flex-1")}
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className={cx(buttonClass, "shrink-0 disabled:opacity-50")}
          aria-label="Enviar"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
