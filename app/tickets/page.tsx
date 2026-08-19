import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import TicketNuevoView from "@/components/views/TicketNuevoView";

export const dynamic = "force-dynamic";

// Universal: cualquier cuenta logueada (ver UNIVERSALES_BASE en lib/roles.ts),
// incluso los roles restringidos — pedirle ayuda a sistemas no depende del rol.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  return <TicketNuevoView />;
}
