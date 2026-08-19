import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";
import PanelSistemasTabs from "@/components/layout/PanelSistemasTabs";

export const dynamic = "force-dynamic";

// Gate único para TODO lo que cuelga de /panel-sistemas/*: acá se decide quién
// entra (una vez), no en cada sub-página. Lista blanca dinámica (base fija del
// código + agregados a mano en "Inicio"), no depende del rol ni del nav del
// sidebar — ver lib/panel-sistemas-store.ts.
export default async function PanelSistemasLayout({ children }: { children: React.ReactNode }) {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await puedeVerPanelSistemas(s.email))) redirect(await homeDeSesion(s));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xs font-medium uppercase tracking-wide text-faint">Panel de Sistemas</p>
        <PanelSistemasTabs />
      </div>
      {children}
    </div>
  );
}
