import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe } from "@/lib/roles";
import AperturasView from "@/components/views/AperturasView";

export const dynamic = "force-dynamic";

// Editor del cuadro de aperturas (admin/operaciones). La cartelera (/cartelera) es pública.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.rol !== "admin" && s.rol !== "operaciones") redirect(homeDe(s.rol));
  return <AperturasView />;
}
