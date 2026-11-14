import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { auth } from "@/auth";
import { buildDocument } from "@/lib/proposals/document";
import { renderProposalHtml } from "@/lib/proposals/render";
import { canAccessInternalPortal } from "@/lib/roles";

/**
 * El documento de la propuesta, desnudo: HTML completo servido por un route
 * handler, FUERA de todo layout de Next. Así no hereda Tailwind ni el chrome
 * del portal — el preflight de Tailwind rompe la retícula en milímetros del
 * documento (docs/sales/ESPEC… §2). La especificación pedía dos layouts raíz;
 * esto logra el mismo aislamiento sin reestructurar la app.
 *
 * Un solo renderizador para todo: la vista previa del portal es un <iframe>
 * de esta ruta (?embed=1) y el PDF es la impresión del navegador sobre ella
 * (?print=1), el mismo mecanismo de Reportes.
 *
 * Emitida → se dibuja desde el snapshot congelado. Borrador → desde el
 * catálogo vigente, con marca de agua.
 *
 * No es pública: exige sesión interna y que la propuesta sea de la organización.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user || !user.organizationId || !canAccessInternalPortal(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId)) return new Response("Not found", { status: 404 });

  const [row] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.organizationId, user.organizationId)));
  if (!row) return new Response("Not found", { status: 404 });

  const doc =
    row.snapshot ??
    buildDocument(
      {
        companyId: row.companyId,
        clientName: row.clientName,
        preparedBy: row.preparedBy,
        date: row.date,
        validityDays: row.validityDays,
        productKey: row.productKey,
        planKey: row.planKey,
        billingPeriod: row.billingPeriod,
        items: row.items,
        note: row.note,
        ivaBps: row.ivaBps,
      },
      null,
    );

  const url = new URL(req.url);
  const html = renderProposalHtml(doc, {
    embed: url.searchParams.get("embed") === "1",
    autoPrint: url.searchParams.get("print") === "1",
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
