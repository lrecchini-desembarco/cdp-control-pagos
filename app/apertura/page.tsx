import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import AperturasView from "@/components/views/AperturasView";

export const dynamic = "force-dynamic";

// Editor del cuadro de aperturas. Quién entra lo define el nav del usuario/rol
// (admin/operaciones/gerencia por defecto). La cartelera (/cartelera) es pública.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/apertura"))) redirect(await homeDeSesion(s));
  return <AperturasView />;
}
