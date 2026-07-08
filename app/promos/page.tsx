import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import PromosView from "@/components/views/PromosView";

export const dynamic = "force-dynamic";

// Promociones (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/promos"))) redirect(await homeDeSesion(s));
  return <PromosView />;
}
