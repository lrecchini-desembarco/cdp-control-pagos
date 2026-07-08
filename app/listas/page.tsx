import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import ListasView from "@/components/views/ListasView";

export const dynamic = "force-dynamic";

// Listas de precios y margen mostrador (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/listas"))) redirect(await homeDeSesion(s));
  return <ListasView />;
}
