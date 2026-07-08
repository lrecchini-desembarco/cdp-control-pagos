import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import RentabilidadView from "@/components/views/RentabilidadView";

export const dynamic = "force-dynamic";

// Tablero de rentabilidad + simulador (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/rentabilidad"))) redirect(await homeDeSesion(s));
  return <RentabilidadView />;
}
