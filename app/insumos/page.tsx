import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import InsumosView from "@/components/views/InsumosView";

export const dynamic = "force-dynamic";

// Insumos (sección Costos): admin y operaciones.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/insumos"))) redirect(await homeDeSesion(s));
  return <InsumosView />;
}
