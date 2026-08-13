import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import TutorialesView from "@/components/views/TutorialesView";

export const dynamic = "force-dynamic";

// Tutoriales de ayres. Ver y descargar: todos (ruta universal). Subir: solo admin (lo corta la API).
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/tutoriales/ayres"))) redirect(await homeDeSesion(s));
  return <TutorialesView seccion="ayres" />;
}
