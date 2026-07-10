import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import { googleConfigurado } from "@/lib/google-auth";
import LoginForm from "@/components/views/LoginForm";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { error?: string } }) {
  const s = await getSesion();
  if (s) redirect(await homeDeSesion(s));
  // Google se muestra solo si están cargadas sus credenciales; si no, login clásico.
  return <LoginForm error={searchParams?.error} googleOn={googleConfigurado()} />;
}
