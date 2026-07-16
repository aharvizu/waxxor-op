import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local-disk attachment storage adapter (MVP). Postgres keeps metadata only;
 * blobs live under UPLOADS_DIR (default ./.uploads, gitignored). Productive
 * storage (S3/R2/…) is pending and must be approved before integrating — the
 * adapter surface below is what a future provider has to implement.
 */

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), ".uploads");

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB per file (MVP)

/** Random, extension-free key — the filename never touches the filesystem. */
export function newStorageKey(): string {
  return randomBytes(16).toString("hex");
}

export async function saveAttachment(storageKey: string, data: Buffer): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(storageKey)) throw new Error("invalid storage key");
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, storageKey), data, { flag: "wx" });
}

export async function readAttachment(storageKey: string): Promise<Buffer> {
  if (!/^[a-f0-9]{32}$/.test(storageKey)) throw new Error("invalid storage key");
  return readFile(path.join(UPLOADS_DIR, storageKey));
}

export async function deleteAttachmentBlob(storageKey: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(storageKey)) throw new Error("invalid storage key");
  await unlink(path.join(UPLOADS_DIR, storageKey)).catch(() => {
    // metadata is the source of truth; a missing blob must not block cleanup
  });
}
