import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import MercadoPagoView from "@/components/views/MercadoPagoView";

export const dynamic = "force-dynamic";

// Cobros de Mercado Pago (API), para conciliar contra Tango.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/mercadopago"))) redirect(await homeDeSesion(s));
  return <MercadoPagoView />;
}
