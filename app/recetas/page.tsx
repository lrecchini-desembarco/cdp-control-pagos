import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe, puedeVer } from "@/lib/roles";
import RecetasView from "@/components/views/RecetasView";

export const dynamic = "force-dynamic";

// Recetas (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeVer(s.rol, "/recetas")) redirect(homeDe(s.rol));
  return <RecetasView />;
}
