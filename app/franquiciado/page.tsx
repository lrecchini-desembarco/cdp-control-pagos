import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import FranquiciadoOnboarding from "@/components/views/FranquiciadoOnboarding";

export const dynamic = "force-dynamic";

// Onboarding del franquiciado (marca/local/puesto). El layout manda acá cuando el
// perfil está incompleto; si ya está completo o no es franquiciado, se va a su home.
export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.rol !== "franquiciado" || s.puesto) redirect("/");
  return <FranquiciadoOnboarding email={s.email} />;
}
