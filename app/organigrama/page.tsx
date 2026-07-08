import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import OrganigramaView from "@/components/views/OrganigramaView";

export const dynamic = "force-dynamic";

// Organigrama: lo ve cualquiera que lo tenga en su menú; editar (alta/baja/mover)
// lo gatea la API a admin/operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/organigrama"))) redirect(await homeDeSesion(s));
  return <OrganigramaView />;
}
