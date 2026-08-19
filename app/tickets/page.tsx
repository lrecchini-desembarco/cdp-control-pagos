import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import { puedeAbrirTicket } from "@/lib/tickets";
import TicketNuevoView from "@/components/views/TicketNuevoView";

export const dynamic = "force-dynamic";

// Por ahora, solo sistemas02 mientras se prueba (lib/tickets.ts EMAILS_TICKETS).
// No depende del rol; cuando se decida abrirlo a todo el mundo, esta lista
// se agranda o se sacan estos dos checks.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!puedeAbrirTicket(s.email)) redirect(await homeDeSesion(s));
  return <TicketNuevoView />;
}
