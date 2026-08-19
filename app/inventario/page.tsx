import { redirect } from "next/navigation";

// Se mudó adentro del Panel de Sistemas (ver app/panel-sistemas/inventario).
export default function Page() {
  redirect("/panel-sistemas/inventario");
}
