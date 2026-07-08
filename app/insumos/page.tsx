import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe, puedeVer } from "@/lib/roles";
import InsumosView from "@/components/views/InsumosView";

export const dynamic = "force-dynamic";

// Insumos (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeVer(s.rol, "/insumos")) redirect(homeDe(s.rol));
  return <InsumosView />;
}
