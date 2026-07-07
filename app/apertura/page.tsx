import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe } from "@/lib/roles";
import AperturasView from "@/components/views/AperturasView";

export const dynamic = "force-dynamic";

// Editor del cuadro de aperturas (admin, operaciones y gerencia). La cartelera (/cartelera) es pública.
const PUEDEN = new Set(["admin", "operaciones", "gerencia"]);
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!PUEDEN.has(s.rol)) redirect(homeDe(s.rol));
  return <AperturasView />;
}
