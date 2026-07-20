import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import BienvenidaView from "@/components/views/BienvenidaView";

export const dynamic = "force-dynamic";

// Bienvenida / Nuevo ingreso (sección Empresa): onboarding con tarjeta imprimible.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/bienvenida"))) redirect(await homeDeSesion(s));
  return <BienvenidaView />;
}
