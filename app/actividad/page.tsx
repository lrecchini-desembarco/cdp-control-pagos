import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import ActividadView from "@/components/views/ActividadView";

export const dynamic = "force-dynamic";

// Actividad de ventas: ranking de locales + frescura y productos dormidos.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/actividad"))) redirect(await homeDeSesion(s));
  return <ActividadView />;
}
