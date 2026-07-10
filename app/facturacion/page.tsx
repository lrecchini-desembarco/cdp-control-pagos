import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import FacturacionView from "@/components/views/FacturacionView";

export const dynamic = "force-dynamic";

// Facturación estimada (precio efectivo × unidades, datos vivos de Tango).
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/facturacion"))) redirect(await homeDeSesion(s));
  return <FacturacionView />;
}
