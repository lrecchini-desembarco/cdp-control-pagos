import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe, puedeVer } from "@/lib/roles";
import ListasView from "@/components/views/ListasView";

export const dynamic = "force-dynamic";

// Listas de precios y margen mostrador (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeVer(s.rol, "/listas")) redirect(homeDe(s.rol));
  return <ListasView />;
}
