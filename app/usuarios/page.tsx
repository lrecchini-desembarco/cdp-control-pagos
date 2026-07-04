import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDe } from "@/lib/roles";
import UsuariosView from "@/components/views/UsuariosView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  // admin gestiona; "resenas" entra solo a mirar (la vista se muestra en modo lectura).
  if (s.rol !== "admin" && s.rol !== "resenas") redirect(homeDe(s.rol));
  return <UsuariosView />;
}
