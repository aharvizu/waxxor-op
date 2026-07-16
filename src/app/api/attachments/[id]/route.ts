import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { readAttachment } from "@/lib/attachments";
import { canAccessInternalPortal } from "@/lib/roles";
import { auth } from "@/auth";

/** Org-scoped attachment download (local-disk adapter). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = session?.user;
  if (!user || !user.organizationId || !canAccessInternalPortal(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId)) return new Response("Not found", { status: 404 });

  const [row] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.organizationId, user.organizationId),
      ),
    );
  if (!row) return new Response("Not found", { status: 404 });

  try {
    const data = await readAttachment(row.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(row.size),
        "Content-Disposition": `attachment; filename="${row.filename.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Blob missing", { status: 410 });
  }
}
