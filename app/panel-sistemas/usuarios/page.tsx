import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import UsuariosView from "@/components/views/UsuariosView";

export const dynamic = "force-dynamic";

// El layout del panel ya filtró por la lista blanca; esto es un segundo
// candado específico (gestión de usuarios = admin, siempre, sin excepción).
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.rol !== "admin") redirect(await homeDeSesion(s));
  return <UsuariosView />;
}
