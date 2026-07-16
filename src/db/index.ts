import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// WebSocket driver (not neon-http) so db.transaction() is available.
// Node runtimes below v22 have no native WebSocket; ws covers them all.
neonConfig.webSocketConstructor = ws;

// The pool connects lazily on first query, so module load is side-effect free
// (required for `next build` with a placeholder DATABASE_URL in CI).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

/** A db handle or an open transaction — accept this in helpers that must join the caller's transaction. */
export type DbExecutor = Pick<typeof db, "insert" | "select" | "update" | "delete">;
