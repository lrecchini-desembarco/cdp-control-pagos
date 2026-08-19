import { redirect } from "next/navigation";

// Se mudó adentro del Panel de Sistemas (ver app/panel-sistemas/usuarios).
// Redirect para no romper links/atajos guardados; el chequeo real de acceso
// vive en el destino (app/panel-sistemas/layout.tsx + su propio candado).
export default function Page() {
  redirect("/panel-sistemas/usuarios");
}
