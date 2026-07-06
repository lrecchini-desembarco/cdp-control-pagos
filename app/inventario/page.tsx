import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe } from "@/lib/roles";
import InventarioView from "@/components/views/InventarioView";

export const dynamic = "force-dynamic";

// Solo admin ve el inventario de IT.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.rol !== "admin") redirect(homeDe(s.rol));
  return <InventarioView />;
}
