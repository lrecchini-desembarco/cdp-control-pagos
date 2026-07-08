import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe, puedeVer } from "@/lib/roles";
import AppsView from "@/components/views/AppsView";

export const dynamic = "force-dynamic";

// Precios y margen en apps (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeVer(s.rol, "/apps")) redirect(homeDe(s.rol));
  return <AppsView />;
}
