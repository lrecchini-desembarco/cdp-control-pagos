import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { iguales } from "@/lib/auth-cookie";

export const dynamic = "force-dynamic";

// Locator del servidor de IPs libres (mismo patrón que /api/bridge-url para Tango).
// El watchdog de esa máquina publica acá la URL vigente del túnel cada vez que
// levanta uno nuevo. El dashboard la lee de acá (lib/ip-libres-url), así nunca hay
// que tocar Vercel ni importa que la URL del túnel cambie.

interface IpLibresUrl {
  url: string;
  cuando: string;
}

// GET: para diagnóstico (qué URL tiene guardada el dashboard).
export async function GET() {
  const dato = await readStore<IpLibresUrl | null>("ip-libres-url", null);
  return NextResponse.json({ ok: true, ...(dato ?? { url: null, cuando: null }) });
}

// POST { url } con header x-tunel-secreto -> guarda la URL vigente del servidor.
// Mismo secreto que el resto de los watchdogs de túnel (TUNEL_ADMIN_SECRETO): no
// autoriza a leer nada por sí solo, solo a decir "el servidor está en esta URL".
export async function POST(req: Request) {
  const secreto = process.env.TUNEL_ADMIN_SECRETO;
  if (!secreto || !iguales(req.headers.get("x-tunel-secreto") ?? "", secreto)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url)) {
    return NextResponse.json({ ok: false, error: "url inválida" }, { status: 400 });
  }
  await writeStore<IpLibresUrl>("ip-libres-url", { url: url.replace(/\/+$/, ""), cuando: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
