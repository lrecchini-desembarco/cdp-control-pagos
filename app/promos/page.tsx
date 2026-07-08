import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe, puedeVer } from "@/lib/roles";
import PromosView from "@/components/views/PromosView";

export const dynamic = "force-dynamic";

// Promociones (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeVer(s.rol, "/promos")) redirect(homeDe(s.rol));
  return <PromosView />;
}
