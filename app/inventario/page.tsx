import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe } from "@/lib/roles";
import InventarioView from "@/components/views/InventarioView";

export const dynamic = "force-dynamic";

// Inventario de IT: lo gestiona el admin; el Dueño entra a aprobar compras.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.rol !== "admin" && s.rol !== "dueno") redirect(homeDe(s.rol));
  return <InventarioView />;
}
