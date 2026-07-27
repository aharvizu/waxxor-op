import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { helpChatMessages } from "@/db/schema";

/** Full thread for this user — one continuous conversation, no session/thread concept yet. */
export async function getChatHistory(organizationId: number, userId: number) {
  return db
    .select()
    .from(helpChatMessages)
    .where(and(eq(helpChatMessages.organizationId, organizationId), eq(helpChatMessages.userId, userId)))
    .orderBy(asc(helpChatMessages.createdAt));
}
