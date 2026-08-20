import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import WorkspaceView from "@/components/views/WorkspaceView";

export const dynamic = "force-dynamic";

// Mismo candado que /panel-sistemas/usuarios: acá se lee y escribe sobre TODO
// el Workspace (fotos, permisos), así que es admin siempre, sin excepción.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.rol !== "admin") redirect(await homeDeSesion(s));
  return <WorkspaceView />;
}
