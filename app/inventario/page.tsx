import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import InventarioView from "@/components/views/InventarioView";

export const dynamic = "force-dynamic";

// Inventario de IT: quién entra lo define el nav del usuario/rol (admin por defecto).
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/inventario"))) redirect(await homeDeSesion(s));
  return <InventarioView />;
}
