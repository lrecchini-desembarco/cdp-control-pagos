import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import TangoView from "@/components/views/TangoView";

export const dynamic = "force-dynamic";

// Carga de artículos Tango masivos (generador de importación). El tool es HTML/JS
// autocontenido (public/tango-generador.html) y corre en un iframe para preservar
// EXACTO el mecanismo de parcheo del .xlsx validado contra Tango (no usar librerías).
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/tango"))) redirect(await homeDeSesion(s));
  return <TangoView />;
}
