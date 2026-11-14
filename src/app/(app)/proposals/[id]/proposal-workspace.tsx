"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Pencil, Printer, Trash2 } from "lucide-react";
import { FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { buttonDangerClass, buttonSecondaryClass, buttonSuccessClass, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import type { EffectiveProposalStatus, ProposalStatus } from "@/lib/proposals/types";
import { changeProposalStatus, cloneProposal, deleteDraftProposal, issueProposal } from "../actions";

type Fit = { overflow: boolean; overflowMm: number; level: number };

const LEVEL_NOTES = [
  "",
  "Para caber en una hoja se retiró la línea de firma.",
  "Para caber en una hoja la aceptación pasó a los términos, sin firma.",
  "Para caber en una hoja se quitó la firma y se ocultó la descripción de licencias agregadas.",
];

/**
 * Vista previa + acciones de una propuesta. La vista previa es un <iframe> de
 * /p/[id] — el mismo HTML que se imprime — y el documento mide ahí dentro si
 * cabe en una hoja y lo avisa por postMessage. Mientras desborde (o no haya
 * medido), Emitir queda bloqueado: no se asigna folio a un documento roto.
 */
export function ProposalWorkspace({
  id,
  status,
  allowed,
  version,
}: {
  id: number;
  status: EffectiveProposalStatus;
  allowed: ProposalStatus[];
  /** Cambia cuando cambia la propuesta, para recargar el iframe. */
  version: string;
}) {
  const [fit, setFit] = useState<Fit | null>(null);
  const [issueState, issueAction] = useActionState<ActionState, FormData>(issueProposal, null);
  const [statusState, statusAction] = useActionState<ActionState, FormData>(changeProposalStatus, null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string } & Partial<Fit>;
      if (data?.type !== "proposal-fit") return;
      setFit({ overflow: data.overflow === true, overflowMm: data.overflowMm ?? 0, level: data.level ?? 0 });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const isDraft = status === "draft";
  const canIssue = isDraft && fit !== null && !fit.overflow;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="overflow-hidden rounded-xl border border-edge bg-[#EDEBF3]">
        <iframe
          key={version}
          src={`/p/${id}?embed=1`}
          title="Vista previa del documento"
          // 216 mm × 279 mm a 96 dpi ≈ 816 × 1054 px, más el margen de la vista embebida.
          className="mx-auto block h-[1104px] w-full min-w-[860px]"
        />
      </div>

      <aside className="space-y-4">
        <FormAlert state={issueState} />
        <FormAlert state={statusState} />

        {fit?.overflow ? (
          <p role="alert" className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2.5 text-sm text-danger">
            El documento no cabe en una hoja (sobran {fit.overflowMm} mm).{" "}
            {isDraft ? "Acorta descripciones o reduce partidas para poder emitir." : ""}
          </p>
        ) : fit && fit.level > 0 ? (
          <p className="rounded-lg border border-edge bg-subtle px-3 py-2.5 text-sm text-muted">{LEVEL_NOTES[fit.level]}</p>
        ) : null}

        <div className="space-y-2 rounded-xl border border-edge bg-surface p-4">
          {isDraft ? (
            <>
              <form action={issueAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="fits" value={canIssue ? "yes" : "no"} />
                <SubmitButton className={cx("w-full", !canIssue && "pointer-events-none opacity-50")}>Emitir y asignar folio</SubmitButton>
              </form>
              <p className="text-xs text-muted">
                Al emitir se asigna el folio consecutivo y el documento queda congelado. Después ya no se puede editar.
              </p>
              <Link href={`/proposals/${id}/edit`} className={cx(buttonSecondaryClass, "w-full")}>
                <Pencil /> Editar borrador
              </Link>
            </>
          ) : null}

          <a href={`/p/${id}?print=1`} target="_blank" rel="noreferrer" className={cx(buttonSecondaryClass, "w-full")}>
            <Printer /> {isDraft ? "Imprimir borrador" : "Imprimir / Guardar PDF"}
          </a>

          {allowed.includes("accepted") ? (
            <form action={statusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="accepted" />
              <button type="submit" className={cx(buttonSuccessClass, "w-full")}>Marcar aceptada</button>
            </form>
          ) : null}
          {allowed.includes("rejected") ? (
            <form action={statusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="rejected" />
              <button type="submit" className={cx(buttonSecondaryClass, "w-full")}>Marcar rechazada</button>
            </form>
          ) : null}

          <form action={cloneProposal}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className={cx(buttonSecondaryClass, "w-full")}>
              <Copy /> Clonar en un borrador nuevo
            </button>
          </form>

          {allowed.includes("cancelled") ? (
            <form
              action={statusAction}
              onSubmit={(e) => {
                if (!window.confirm("¿Cancelar esta propuesta? Conserva su folio, que no se reutiliza.")) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="cancelled" />
              <button type="submit" className={cx(buttonDangerClass, "w-full")}>Cancelar propuesta</button>
            </form>
          ) : null}
          {isDraft ? (
            <form
              action={deleteDraftProposal}
              onSubmit={(e) => {
                if (!window.confirm("¿Eliminar este borrador? No tiene folio; no se puede recuperar.")) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={id} />
              <button type="submit" className={cx(buttonDangerClass, "w-full")}>
                <Trash2 /> Eliminar borrador
              </button>
            </form>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
