import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { homeDeSesion, sesionPuedeVer } from "@/lib/roles-store";
import IpLibresView from "@/components/views/IpLibresView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSesion();
  if (!s) redirect("/login");
  if (!(await sesionPuedeVer(s, "/ip-libres"))) redirect(await homeDeSesion(s));
  return <IpLibresView />;
}
