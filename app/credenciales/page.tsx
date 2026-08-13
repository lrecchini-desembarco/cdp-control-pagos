import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import { puedeVerCredenciales } from "@/lib/credenciales";
import CredencialesView from "@/components/views/CredencialesView";

export const dynamic = "force-dynamic";

// Credenciales: no se rige por el rol sino por la lista blanca de emails
// (lib/credenciales.ts). Un admin que no esté en la lista rebota a su home.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeVerCredenciales(s.email)) redirect(await homeDeSesion(s));
  return <CredencialesView />;
}
