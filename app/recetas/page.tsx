import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import RecetasView from "@/components/views/RecetasView";

export const dynamic = "force-dynamic";

// Recetas (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/recetas"))) redirect(await homeDeSesion(s));
  return <RecetasView />;
}
