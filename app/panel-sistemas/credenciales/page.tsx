import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import { puedeVerCredenciales } from "@/lib/credenciales";
import CredencialesShell from "@/components/views/CredencialesShell";

export const dynamic = "force-dynamic";

// Candado propio, MÁS ESTRICTO que el del panel: la lista de Credenciales
// (lib/credenciales.ts) es fija en el código y no crece agregando gente al
// panel — así alguien puede tener acceso al Panel de Sistemas sin heredar
// la bóveda de contraseñas.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeVerCredenciales(s.email)) redirect(await homeDeSesion(s));
  return <CredencialesShell />;
}
