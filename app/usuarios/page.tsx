import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import UsuariosView from "@/components/views/UsuariosView";

export const dynamic = "force-dynamic";

// Gestión de usuarios: solo admin (por seguridad, aunque esté en el nav de otro).
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.rol !== "admin") redirect(await homeDeSesion(s));
  return <UsuariosView />;
}
