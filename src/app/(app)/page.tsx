import { redirect } from "next/navigation";

/** Today is Watson's home. The legacy dashboard lives at /dashboard. */
export default function Home() {
  redirect("/today");
}
