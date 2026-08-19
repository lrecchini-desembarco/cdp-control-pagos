import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";
import PanelSistemasView from "@/components/views/PanelSistemasView";

export const dynamic = "force-dynamic";

// No se rige por rol ni por el nav del sidebar: es una lista blanca de emails
// (base fija + agregados a mano desde la propia pantalla). Un admin que no
// esté en la lista rebota a su home, igual que Credenciales.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await puedeVerPanelSistemas(s.email))) redirect(await homeDeSesion(s));
  return <PanelSistemasView />;
}
