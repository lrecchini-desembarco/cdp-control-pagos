import { redirect } from "next/navigation";

// Se mudó adentro del Panel de Sistemas (ver app/panel-sistemas/ip-libres).
export default function Page() {
  redirect("/panel-sistemas/ip-libres");
}
