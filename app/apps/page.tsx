import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import AppsView from "@/components/views/AppsView";

export const dynamic = "force-dynamic";

// Precios y margen en apps (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/apps"))) redirect(await homeDeSesion(s));
  return <AppsView />;
}
