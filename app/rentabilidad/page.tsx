import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe, puedeVer } from "@/lib/roles";
import RentabilidadView from "@/components/views/RentabilidadView";

export const dynamic = "force-dynamic";

// Tablero de rentabilidad + simulador (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeVer(s.rol, "/rentabilidad")) redirect(homeDe(s.rol));
  return <RentabilidadView />;
}
