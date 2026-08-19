import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion } from "@/lib/roles-store";
import IpLibresView from "@/components/views/IpLibresView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (s.rol !== "admin") redirect(await homeDeSesion(s));
  return <IpLibresView />;
}
