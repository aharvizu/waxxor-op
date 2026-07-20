import { cookies } from "next/headers";

/** Server-side counterpart to src/components/views/last-view.ts's rememberLastView(). */
export async function getLastViewId(module: string): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(`wx-view-${module}`)?.value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
