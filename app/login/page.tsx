import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import LoginForm from "@/components/views/LoginForm";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSesion();
  if (s) redirect(await homeDeSesion(s));
  return <LoginForm />;
}
