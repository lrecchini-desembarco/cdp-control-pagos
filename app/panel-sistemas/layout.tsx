import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";
import ConsolaShell from "@/components/layout/ConsolaShell";
import { CONSOLA_DARK_VARS } from "@/components/layout/consola-tema";

export const dynamic = "force-dynamic";

// Gate único para TODO lo que cuelga de /panel-sistemas/*: acá se decide quién
// entra (una vez), no en cada sub-página. Lista blanca dinámica (base fija del
// código + agregados a mano en "Inicio"), no depende del rol ni del nav del
// sidebar — ver lib/panel-sistemas-store.ts.
//
// Este layout ya NO vive dentro del shell del CDP (app/layout.tsx lo saltea
// para esta ruta, ver esPanelSistemas ahí): pinta su propia consola completa
// (ConsolaShell), siempre en oscuro sin importar el tema del CDP.
export default async function PanelSistemasLayout({ children }: { children: React.ReactNode }) {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await puedeVerPanelSistemas(s.email))) redirect(await homeDeSesion(s));

  return (
    <div style={CONSOLA_DARK_VARS}>
      <ConsolaShell email={s.email}>{children}</ConsolaShell>
    </div>
  );
}
